-- 0022 tabs and orders: open_tab, add_items, transfer_tab, merge_tabs,
-- cancel_tab, void_item. Any active staff (SPEC roles table); a waiter
-- transfers and merges only their own tabs.
--
-- A line is voided by UPDATE-ing order_items.voided_at (never DELETE): the
-- stock phase's trigger writes the void_return movement from that update.

-- ---------------------------------------------------------------------------
-- app.open_tab(table, covers, key) -> {tab_id, table_id, covers, status,
--                                       opened_at, day_session_id}
-- ---------------------------------------------------------------------------
create or replace function app.open_tab(p_table_id uuid, p_covers int, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $open_tab$
declare
  v_replay     jsonb;
  v_day        uuid;
  v_tab        tabs%rowtype;
  v_constraint text;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  -- FOR SHARE: close_day cannot run until this tab is committed.
  select d.id into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null
   for share;
  if v_day is null then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;
  if p_covers is null or p_covers < 1 or p_covers > 999 then
    raise exception 'INVALID_COVERS' using errcode = 'P0001';
  end if;
  if p_table_id is not null and not exists (
       select 1 from dining_tables dt
        where dt.id = p_table_id and dt.venue_id = app.current_venue() and dt.is_active) then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;

  begin
    insert into tabs (day_session_id, table_id, waiter_id, covers, idempotency_key)
    values (v_day, p_table_id, auth.uid(), p_covers, p_idempotency_key)
    returning * into v_tab;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'tabs_one_open_per_table' then
      raise exception 'TABLE_OCCUPIED' using errcode = 'P0001';
    end if;
    raise;
  end;

  perform app.write_audit('tab.open', 'tabs', v_tab.id, null, to_jsonb(v_tab));
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'tab_id', v_tab.id,
    'table_id', v_tab.table_id,
    'covers', v_tab.covers,
    'status', v_tab.status,
    'opened_at', v_tab.opened_at,
    'day_session_id', v_tab.day_session_id));
end $open_tab$;

-- ---------------------------------------------------------------------------
-- app.add_items(tab, items, key) -> {order_id, tab_id, lines[], totals}
-- items: [{menu_item_id, qty, modifier_ids[], note}]. The server prices every
-- line: unit_price = item price + modifier deltas, with name and tax snapshots.
-- lines[]: {id, menu_item_id, name_en, name_ar, unit_price, qty, line_total,
--           tax_rate_bps, note}, in input order.
-- ---------------------------------------------------------------------------
create or replace function app.add_items(p_tab_id uuid, p_items jsonb, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $add_items$
declare
  v_replay jsonb;
  v_tab    tabs%rowtype;
  v_order  uuid;
  v_item   jsonb;
  v_qty    int;
  v_mi     record;
  v_mods   uuid[];
  v_unit   bigint;
  v_line   order_items%rowtype;
  v_lines  jsonb := '[]'::jsonb;
  v_totals jsonb;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  v_tab := app.lock_open_tab(p_tab_id);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = 'P0001';
  end if;

  insert into orders (tab_id, placed_by, idempotency_key)
  values (v_tab.id, auth.uid(), p_idempotency_key)
  returning id into v_order;

  for v_item in select e from jsonb_array_elements(p_items) with ordinality as a(e, n) order by n loop
    if jsonb_typeof(v_item -> 'qty') is distinct from 'number' then
      raise exception 'INVALID_QTY' using errcode = 'P0001';
    end if;
    if (v_item ->> 'qty')::numeric <> trunc((v_item ->> 'qty')::numeric)
       or (v_item ->> 'qty')::numeric not between 1 and 999 then
      raise exception 'INVALID_QTY' using errcode = 'P0001';
    end if;
    v_qty := (v_item ->> 'qty')::int;

    select mi.id, mi.name_en, mi.name_ar, mi.price, tg.rate_bps into v_mi
      from menu_items mi
      join menu_categories mc on mc.id = mi.category_id
      join tax_groups tg on tg.id = mi.tax_group_id
     where mi.id = (v_item ->> 'menu_item_id')::uuid
       and mi.venue_id = app.current_venue()
       and mi.is_active and mc.is_active;
    if not found then
      raise exception 'ITEM_NOT_AVAILABLE' using errcode = 'P0001';
    end if;

    v_mods := array(select jsonb_array_elements_text(coalesce(v_item -> 'modifier_ids', '[]'::jsonb))::uuid);
    -- Each modifier: listed once, active, and in a group linked to this item.
    if cardinality(v_mods) <> (
         select count(distinct m.id)
           from modifiers m
           join menu_item_modifier_groups l on l.group_id = m.group_id and l.menu_item_id = v_mi.id
          where m.id = any (v_mods) and m.is_active)
       or cardinality(v_mods) <> (select count(distinct u) from unnest(v_mods) u) then
      raise exception 'MODIFIER_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    -- Each linked group: between min_select and max_select chosen.
    if exists (
         select 1
           from menu_item_modifier_groups l
           join modifier_groups g on g.id = l.group_id
          where l.menu_item_id = v_mi.id
            and (select count(*) from modifiers m where m.group_id = g.id and m.id = any (v_mods))
                not between g.min_select and g.max_select) then
      raise exception 'MODIFIER_SELECTION_INVALID' using errcode = 'P0001';
    end if;

    v_unit := v_mi.price + coalesce((select sum(m.price_delta) from modifiers m where m.id = any (v_mods)), 0);
    if v_unit < 0 then
      raise exception 'INVALID_PRICE' using errcode = 'P0001';
    end if;

    insert into order_items (order_id, tab_id, menu_item_id, name_en, name_ar, unit_price, qty,
                             line_total, tax_rate_bps, note)
    values (v_order, v_tab.id, v_mi.id, v_mi.name_en, v_mi.name_ar, v_unit, v_qty,
            v_unit * v_qty, v_mi.rate_bps, nullif(btrim(v_item ->> 'note'), ''))
    returning * into v_line;

    insert into order_item_modifiers (order_item_id, modifier_id, name_en, name_ar, price_delta)
    select v_line.id, m.id, m.name_en, m.name_ar, m.price_delta
      from modifiers m where m.id = any (v_mods);

    v_lines := v_lines || jsonb_build_object(
      'id', v_line.id, 'menu_item_id', v_line.menu_item_id,
      'name_en', v_line.name_en, 'name_ar', v_line.name_ar,
      'unit_price', v_line.unit_price, 'qty', v_line.qty, 'line_total', v_line.line_total,
      'tax_rate_bps', v_line.tax_rate_bps, 'note', v_line.note);
  end loop;

  v_totals := app.compute_tab_totals(v_tab.id);
  perform app.write_audit('order.send', 'orders', v_order, null,
                          jsonb_build_object('tab_id', v_tab.id, 'lines', v_lines));
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'order_id', v_order, 'tab_id', v_tab.id, 'lines', v_lines, 'totals', v_totals));
end $add_items$;

-- ---------------------------------------------------------------------------
-- app.transfer_tab(tab, table) -> {tab_id, table_id}
-- ---------------------------------------------------------------------------
create or replace function app.transfer_tab(p_tab_id uuid, p_table_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $transfer_tab$
declare
  v_tab        tabs%rowtype;
  v_constraint text;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_tab := app.lock_open_tab(p_tab_id);
  if app.staff_role() = 'waiter' and v_tab.waiter_id <> auth.uid() then
    raise exception 'NOT_YOUR_TAB' using errcode = 'P0001';
  end if;
  if p_table_id is null or not exists (
       select 1 from dining_tables dt
        where dt.id = p_table_id and dt.venue_id = app.current_venue() and dt.is_active) then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_tab.table_id is distinct from p_table_id then
    begin
      update tabs set table_id = p_table_id where id = v_tab.id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'tabs_one_open_per_table' then
        raise exception 'TABLE_OCCUPIED' using errcode = 'P0001';
      end if;
      raise;
    end;
    perform app.write_audit('tab.transfer', 'tabs', v_tab.id,
                            jsonb_build_object('table_id', v_tab.table_id),
                            jsonb_build_object('table_id', p_table_id));
  end if;
  return jsonb_build_object('tab_id', v_tab.id, 'table_id', p_table_id);
end $transfer_tab$;

-- ---------------------------------------------------------------------------
-- app.merge_tabs(from, into) -> {from_tab_id, into_tab_id, totals (of into)}
-- Moves the source's orders, lines and discounts into the target, adds its
-- covers, and voids the source with merged_into_tab_id set. A source with
-- payments is refused (payments are append-only, so they cannot move).
-- ---------------------------------------------------------------------------
create or replace function app.merge_tabs(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = public as $merge_tabs$
declare
  v_from tabs%rowtype;
  v_into tabs%rowtype;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_from = p_into then
    raise exception 'MERGE_SELF' using errcode = 'P0001';
  end if;
  -- Two tabs: lock them in id order so two opposite merges cannot deadlock.
  if p_from < p_into then
    v_from := app.lock_open_tab(p_from);
    v_into := app.lock_open_tab(p_into);
  else
    v_into := app.lock_open_tab(p_into);
    v_from := app.lock_open_tab(p_from);
  end if;
  if app.staff_role() = 'waiter' and (v_from.waiter_id <> auth.uid() or v_into.waiter_id <> auth.uid()) then
    raise exception 'NOT_YOUR_TAB' using errcode = 'P0001';
  end if;
  if exists (select 1 from payments p where p.tab_id = v_from.id) then
    raise exception 'MERGE_SOURCE_HAS_PAYMENTS' using errcode = 'P0001';
  end if;

  update orders set tab_id = v_into.id where tab_id = v_from.id;
  update order_items set tab_id = v_into.id where tab_id = v_from.id;
  update tab_adjustments set tab_id = v_into.id where tab_id = v_from.id;
  update tabs set covers = covers + v_from.covers where id = v_into.id;
  update tabs
     set status = 'void', closed_at = now(), merged_into_tab_id = v_into.id
   where id = v_from.id;

  perform app.write_audit('tab.merge', 'tabs', v_from.id, to_jsonb(v_from),
                          jsonb_build_object('merged_into_tab_id', v_into.id));
  return jsonb_build_object('from_tab_id', v_from.id, 'into_tab_id', v_into.id,
                            'totals', app.compute_tab_totals(v_into.id));
end $merge_tabs$;

-- ---------------------------------------------------------------------------
-- app.cancel_tab(tab, reason) -> {tab_id, status}
-- Empty tab: any staff. A tab with live lines: cashier with a manager PIN
-- ('cancel_tab'), manager or owner; its lines are voided with the reason.
-- A tab with payments is refused (refund and settle it instead).
-- ---------------------------------------------------------------------------
create or replace function app.cancel_tab(p_tab_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $cancel_tab$
declare
  v_tab  tabs%rowtype;
  v_auth uuid;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  v_tab := app.lock_open_tab(p_tab_id);
  if exists (select 1 from payments p where p.tab_id = v_tab.id) then
    raise exception 'TAB_HAS_PAYMENTS' using errcode = 'P0001';
  end if;

  if exists (select 1 from order_items oi where oi.tab_id = v_tab.id and oi.voided_at is null) then
    if not app.is_staff('cashier', 'manager', 'owner') then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                   else app.consume_pin_grant('cancel_tab') end;
    update order_items
       set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, void_authorized_by = v_auth
     where tab_id = v_tab.id and voided_at is null;
  end if;

  update tabs set status = 'void', closed_at = now() where id = v_tab.id;
  perform app.write_audit('tab.cancel', 'tabs', v_tab.id, to_jsonb(v_tab),
                          jsonb_build_object('status', 'void'), p_reason, v_auth);
  return jsonb_build_object('tab_id', v_tab.id, 'status', 'void');
end $cancel_tab$;

-- ---------------------------------------------------------------------------
-- app.void_item(line, reason) -> {order_item_id, tab_id, totals}
-- Waiter and cashier need a manager PIN ('void_item'); a manager or owner is
-- recorded as their own authorizer.
-- ---------------------------------------------------------------------------
create or replace function app.void_item(p_order_item_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $void_item$
declare
  v_tab_id uuid;
  v_tab    tabs%rowtype;
  v_line   order_items%rowtype;
  v_auth   uuid;
  v_totals jsonb;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select oi.tab_id into v_tab_id from order_items oi
   where oi.id = p_order_item_id and oi.venue_id = app.current_venue();
  if v_tab_id is null then
    raise exception 'LINE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Lock order: the tab, then its line.
  v_tab := app.lock_open_tab(v_tab_id);
  select * into v_line from order_items where id = p_order_item_id for update;
  if v_line.voided_at is not null then
    raise exception 'LINE_ALREADY_VOIDED' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('void_item') end;
  update order_items
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, void_authorized_by = v_auth
   where id = v_line.id;

  v_totals := app.tab_after_change(v_tab.id);
  perform app.write_audit('order_item.void', 'order_items', v_line.id, to_jsonb(v_line),
                          jsonb_build_object('voided_by', auth.uid()), p_reason, v_auth);
  return jsonb_build_object('order_item_id', v_line.id, 'tab_id', v_tab.id, 'totals', v_totals);
end $void_item$;

revoke all on function app.open_tab(uuid, int, text) from public, anon, authenticated;
revoke all on function app.add_items(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function app.transfer_tab(uuid, uuid) from public, anon, authenticated;
revoke all on function app.merge_tabs(uuid, uuid) from public, anon, authenticated;
revoke all on function app.cancel_tab(uuid, text) from public, anon, authenticated;
revoke all on function app.void_item(uuid, text) from public, anon, authenticated;
grant execute on function app.open_tab(uuid, int, text) to authenticated;
grant execute on function app.add_items(uuid, jsonb, text) to authenticated;
grant execute on function app.transfer_tab(uuid, uuid) to authenticated;
grant execute on function app.merge_tabs(uuid, uuid) to authenticated;
grant execute on function app.cancel_tab(uuid, text) to authenticated;
grant execute on function app.void_item(uuid, text) to authenticated;
