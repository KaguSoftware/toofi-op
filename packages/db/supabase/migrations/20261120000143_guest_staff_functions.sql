-- 0143 guest QR menu: staff functions (granted to authenticated, role check
-- first, listed in tests/rls-matrix.ts). Contract: .scratch/qr-menu/spec.md,
-- "Staff functions".
--
--   all staff        guest_inbox, answer_waiter_call, accept_guest_order,
--                    decline_guest_order
--   manager, owner   table_qr_tokens, set_table_guest_enabled, set_guest_service
--   owner            rotate_table_token
--
-- accept_guest_order is the only path from a guest order to money and stock: it
-- runs app.open_tab (free table) and app.add_items as the accepting staff member,
-- with keys derived from its own key, so pricing, audit, stock and realtime are
-- exactly a waiter's. Lock order: day_sessions (FOR SHARE) -> the table
-- (app.lock_guest_table) -> guest_orders (FOR UPDATE) -> tabs -> ...

-- ---------------------------------------------------------------------------
-- app.guest_inbox() -> {calls: [...], orders: [...]} for the open business day,
-- oldest first. Empty lists when no day is open.
--   calls:  {id, table_id, table_label, reason, called_at}   (open calls)
--   orders: {id, table_id, table_label, sent_at, lines, total, current_total,
--            price_changed, unavailable, table_has_tab}       (pending orders)
-- lines/total are what the guest was shown at send; current_total re-prices the
-- stored items against the menu now (null when a line can no longer be ordered,
-- which sets unavailable); price_changed when any unit price differs.
-- ---------------------------------------------------------------------------
create or replace function app.guest_inbox() returns jsonb
language plpgsql stable security definer set search_path = public as $guest_inbox$
declare
  v_day    uuid;
  v_calls  jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_g      record;
  v_q      jsonb;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select d.id into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null;
  if v_day is null then
    return jsonb_build_object('calls', '[]'::jsonb, 'orders', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'table_id', c.table_id, 'table_label', t.label,
           'reason', c.reason, 'called_at', c.called_at)
         order by c.called_at, c.id), '[]'::jsonb)
    into v_calls
    from waiter_calls c
    join dining_tables t on t.id = c.table_id
   where c.day_session_id = v_day and c.answered_at is null;

  for v_g in
    select g.*, t.label as table_label
      from guest_orders g
      join dining_tables t on t.id = g.table_id
     where g.day_session_id = v_day and g.status = 'pending'
     order by g.sent_at, g.id
  loop
    begin
      v_q := app.guest_quote(v_g.venue_id, v_g.items);
    exception when raise_exception then
      v_q := null;
    end;
    v_orders := v_orders || jsonb_build_object(
      'id', v_g.id, 'table_id', v_g.table_id, 'table_label', v_g.table_label,
      'sent_at', v_g.sent_at, 'lines', v_g.quote, 'total', v_g.quoted_total,
      'current_total', v_q -> 'total',
      'price_changed', coalesce(jsonb_path_query_array(v_q -> 'lines', '$[*].unit_price')
                                  <> jsonb_path_query_array(v_g.quote, '$[*].unit_price'), false),
      'unavailable', v_q is null,
      'table_has_tab', exists (select 1 from tabs tb where tb.table_id = v_g.table_id and tb.status = 'open'));
  end loop;

  return jsonb_build_object('calls', v_calls, 'orders', v_orders);
end $guest_inbox$;

-- ---------------------------------------------------------------------------
-- app.answer_waiter_call(call) -> {call_id, status: 'answered', answered_at,
--                                   answered_by, already}
-- One tap answers. A second tap returns already: true and changes nothing.
-- ---------------------------------------------------------------------------
create or replace function app.answer_waiter_call(p_call_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $answer_waiter_call$
declare
  v_call    waiter_calls%rowtype;
  v_already boolean;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_call from waiter_calls c
   where c.id = p_call_id and c.venue_id = app.current_venue()
   for update;
  if not found then
    raise exception 'WAITER_CALL_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_already := v_call.answered_at is not null;
  if not v_already then
    update waiter_calls set answered_at = now(), answered_by = auth.uid()
     where id = v_call.id
     returning * into v_call;
  end if;
  return jsonb_build_object('call_id', v_call.id, 'status', 'answered', 'answered_at', v_call.answered_at,
                            'answered_by', v_call.answered_by, 'already', v_already);
end $answer_waiter_call$;

-- ---------------------------------------------------------------------------
-- app.accept_guest_order(guest order, covers, key)
--   -> {guest_order_id, status: 'accepted', tab_id, order_id, totals, already}
-- Pending only. Already accepted: its stored tab and order with the tab's totals
-- now, and already: true. Declined: GUEST_ORDER_NOT_PENDING. From a business day
-- that is no longer open: GUEST_ORDER_EXPIRED. A free table needs covers
-- (COVERS_REQUIRED) and gets app.open_tab; then app.add_items adds the stored
-- items at today's menu prices. If add_items refuses (an item went inactive), the
-- whole call rolls back and the error reaches the staff member.
-- ---------------------------------------------------------------------------
create or replace function app.accept_guest_order(
  p_guest_order_id  uuid,
  p_covers          int,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $accept_guest_order$
declare
  v_replay jsonb;
  v_go     guest_orders%rowtype;
  v_day    uuid;
  v_tab    uuid;
  v_open   jsonb;
  v_add    jsonb;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_go from guest_orders g
   where g.id = p_guest_order_id and g.venue_id = app.current_venue();
  if not found then
    raise exception 'GUEST_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions, the table, then the guest order.
  select d.id into v_day from day_sessions d
   where d.venue_id = v_go.venue_id and d.closed_at is null
   for share;
  perform app.lock_guest_table(v_go.table_id);
  select * into v_go from guest_orders g where g.id = v_go.id for update;

  if v_go.status = 'accepted' then
    return app.finish_replay(p_idempotency_key, jsonb_build_object(
      'guest_order_id', v_go.id, 'status', v_go.status, 'tab_id', v_go.tab_id, 'order_id', v_go.order_id,
      'totals', app.compute_tab_totals(v_go.tab_id), 'already', true));
  end if;
  if v_go.status = 'declined' then
    raise exception 'GUEST_ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;
  if v_day is distinct from v_go.day_session_id then
    raise exception 'GUEST_ORDER_EXPIRED' using errcode = 'P0001';
  end if;

  select t.id into v_tab from tabs t where t.table_id = v_go.table_id and t.status = 'open';
  if v_tab is null then
    if p_covers is null then
      raise exception 'COVERS_REQUIRED' using errcode = 'P0001';
    end if;
    v_open := app.open_tab(v_go.table_id, p_covers, p_idempotency_key || ':open_tab');
    v_tab := (v_open ->> 'tab_id')::uuid;
  end if;
  v_add := app.add_items(v_tab, v_go.items, p_idempotency_key || ':add_items');

  update guest_orders
     set status = 'accepted', decided_at = now(), decided_by = auth.uid(),
         tab_id = v_tab, order_id = (v_add ->> 'order_id')::uuid
   where id = v_go.id;

  perform app.write_audit('guest_order.accept', 'guest_orders', v_go.id,
                          jsonb_build_object('status', v_go.status, 'quoted_total', v_go.quoted_total),
                          jsonb_build_object('status', 'accepted', 'tab_id', v_tab,
                                             'order_id', v_add ->> 'order_id',
                                             'total', v_add -> 'totals' -> 'total'));
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'guest_order_id', v_go.id, 'status', 'accepted', 'tab_id', v_tab,
    'order_id', (v_add ->> 'order_id')::uuid, 'totals', v_add -> 'totals', 'already', false));
end $accept_guest_order$;

-- ---------------------------------------------------------------------------
-- app.decline_guest_order(guest order) -> {guest_order_id, status: 'declined', already}
-- Pending -> declined, audited. Already declined: already: true. Accepted:
-- GUEST_ORDER_NOT_PENDING.
-- ---------------------------------------------------------------------------
create or replace function app.decline_guest_order(p_guest_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $decline_guest_order$
declare
  v_go guest_orders%rowtype;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_go from guest_orders g
   where g.id = p_guest_order_id and g.venue_id = app.current_venue()
   for update;
  if not found then
    raise exception 'GUEST_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_go.status = 'declined' then
    return jsonb_build_object('guest_order_id', v_go.id, 'status', 'declined', 'already', true);
  end if;
  if v_go.status = 'accepted' then
    raise exception 'GUEST_ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;

  update guest_orders set status = 'declined', decided_at = now(), decided_by = auth.uid()
   where id = v_go.id;
  perform app.write_audit('guest_order.decline', 'guest_orders', v_go.id,
                          jsonb_build_object('status', v_go.status),
                          jsonb_build_object('status', 'declined'));
  return jsonb_build_object('guest_order_id', v_go.id, 'status', 'declined', 'already', false);
end $decline_guest_order$;

-- ---------------------------------------------------------------------------
-- app.table_qr_tokens() -> [{table_id, label, area_id, token, guest_enabled}]
-- Active tables, ordered for print (area, then label). One audit row per call;
-- the audit never holds a token.
-- ---------------------------------------------------------------------------
create or replace function app.table_qr_tokens() returns jsonb
language plpgsql security definer set search_path = public as $table_qr_tokens$
declare
  v_out jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'table_id', t.id, 'label', t.label, 'area_id', t.area_id,
           'token', l.token, 'guest_enabled', l.guest_enabled)
         order by a.sort, a.name_en, a.id, t.label), '[]'::jsonb)
    into v_out
    from dining_tables t
    join table_links l on l.table_id = t.id
    join floor_areas a on a.id = t.area_id
   where t.venue_id = app.current_venue() and t.is_active;
  perform app.write_audit('table_link.read_tokens', 'table_links', null, null,
                          jsonb_build_object('tables', jsonb_array_length(v_out)));
  return v_out;
end $table_qr_tokens$;

-- ---------------------------------------------------------------------------
-- app.set_table_guest_enabled(table, enabled) -> {table_id, guest_enabled}
-- One table's switch for both guest calls and guest orders. Audited.
-- ---------------------------------------------------------------------------
create or replace function app.set_table_guest_enabled(p_table_id uuid, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $set_table_guest_enabled$
declare
  v_link table_links%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_enabled is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_link from table_links l
   where l.table_id = p_table_id and l.venue_id = app.current_venue()
   for update;
  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_link.guest_enabled is distinct from p_enabled then
    update table_links set guest_enabled = p_enabled where id = v_link.id;
    perform app.write_audit('table_link.set_guest_enabled', 'table_links', v_link.id,
                            jsonb_build_object('table_id', p_table_id, 'guest_enabled', v_link.guest_enabled),
                            jsonb_build_object('table_id', p_table_id, 'guest_enabled', p_enabled));
  end if;
  return jsonb_build_object('table_id', p_table_id, 'guest_enabled', p_enabled);
end $set_table_guest_enabled$;

-- ---------------------------------------------------------------------------
-- app.set_guest_service(calls, orders) -> {calls_enabled, orders_enabled}
-- The venue's two switches. Audited.
-- ---------------------------------------------------------------------------
create or replace function app.set_guest_service(p_calls_enabled boolean, p_orders_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $set_guest_service$
declare
  v_before venue_settings%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_calls_enabled is null or p_orders_enabled is null then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;
  select * into v_before from venue_settings vs where vs.venue_id = app.current_venue() for update;
  if not found then
    raise exception 'SETTINGS_INVALID' using errcode = 'P0001';
  end if;
  update venue_settings
     set guest_calls_enabled = p_calls_enabled, guest_orders_enabled = p_orders_enabled
   where venue_id = v_before.venue_id;
  perform app.write_audit('venue_settings.guest_service', 'venue_settings', v_before.venue_id,
                          jsonb_build_object('guest_calls_enabled', v_before.guest_calls_enabled,
                                             'guest_orders_enabled', v_before.guest_orders_enabled),
                          jsonb_build_object('guest_calls_enabled', p_calls_enabled,
                                             'guest_orders_enabled', p_orders_enabled));
  return jsonb_build_object('calls_enabled', p_calls_enabled, 'orders_enabled', p_orders_enabled);
end $set_guest_service$;

-- ---------------------------------------------------------------------------
-- app.rotate_table_token(table) -> {table_id, rotated_at, sessions_closed}
-- Owner only. A new token; every live session of the table closes. Audited.
-- Never returns the token (managers print it through table_qr_tokens).
-- ---------------------------------------------------------------------------
create or replace function app.rotate_table_token(p_table_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $rotate_table_token$
declare
  v_link   table_links%rowtype;
  v_at     timestamptz;
  v_closed int;
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_link from table_links l
   where l.table_id = p_table_id and l.venue_id = app.current_venue()
   for update;
  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;
  update table_links set token = app.new_table_token(), rotated_at = now()
   where id = v_link.id
   returning rotated_at into v_at;
  update app.guest_sessions set closed_at = now()
   where table_id = p_table_id and closed_at is null;
  get diagnostics v_closed = row_count;
  perform app.write_audit('table_link.rotate', 'table_links', v_link.id,
                          jsonb_build_object('table_id', p_table_id, 'rotated_at', v_link.rotated_at),
                          jsonb_build_object('table_id', p_table_id, 'rotated_at', v_at,
                                             'sessions_closed', v_closed));
  return jsonb_build_object('table_id', p_table_id, 'rotated_at', v_at, 'sessions_closed', v_closed);
end $rotate_table_token$;

revoke all on function app.guest_inbox() from public, anon, authenticated;
revoke all on function app.answer_waiter_call(uuid) from public, anon, authenticated;
revoke all on function app.accept_guest_order(uuid, int, text) from public, anon, authenticated;
revoke all on function app.decline_guest_order(uuid) from public, anon, authenticated;
revoke all on function app.table_qr_tokens() from public, anon, authenticated;
revoke all on function app.set_table_guest_enabled(uuid, boolean) from public, anon, authenticated;
revoke all on function app.set_guest_service(boolean, boolean) from public, anon, authenticated;
revoke all on function app.rotate_table_token(uuid) from public, anon, authenticated;
grant execute on function app.guest_inbox() to authenticated;
grant execute on function app.answer_waiter_call(uuid) to authenticated;
grant execute on function app.accept_guest_order(uuid, int, text) to authenticated;
grant execute on function app.decline_guest_order(uuid) to authenticated;
grant execute on function app.table_qr_tokens() to authenticated;
grant execute on function app.set_table_guest_enabled(uuid, boolean) to authenticated;
grant execute on function app.set_guest_service(boolean, boolean) to authenticated;
grant execute on function app.rotate_table_token(uuid) to authenticated;
