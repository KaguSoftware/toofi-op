-- 0082 discounts, merge and PIN-gated tab functions (review fixes).
--
--   apply_discount: now takes p_idempotency_key (claim_replay / finish_replay):
--     a retried discount is applied once. Signature
--     (uuid, adjustment_kind, bigint, text) -> (uuid, adjustment_kind, bigint, text, text).
--     Its PIN grant is matched to the tab (entity = tabs.id).
--   merge_tabs: refuses a source with discounts (MERGE_SOURCE_HAS_DISCOUNTS) and
--     runs tab_after_change on the target (paid-versus-total check, settle at 0).
--   cancel_tab, void_item: PIN grant matched to the tab / the line.
-- Bodies are otherwise those of 0022 / 0023.

drop function app.apply_discount(uuid, adjustment_kind, bigint, text);

-- ---------------------------------------------------------------------------
-- app.apply_discount(tab, kind, value, reason, key) -> {adjustment_id, amount, totals}
-- discount_percent: value in basis points; amount answers what it takes off now
-- (rd(S * value, 10000), capped at what is left of the subtotal). The totals
-- re-derive a percent from the live subtotal on every change (0081).
-- discount_amount: value in IQD, capped at what is left. PIN action 'discount'.
-- ---------------------------------------------------------------------------
create function app.apply_discount(
  p_tab_id          uuid,
  p_kind            adjustment_kind,
  p_value           bigint,
  p_reason          text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public as $apply_discount$
declare
  v_replay jsonb;
  v_tab    tabs%rowtype;
  v_tot    jsonb;
  v_amount bigint;
  v_auth   uuid;
  v_adj    tab_adjustments%rowtype;
  v_totals jsonb;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_kind is null or p_value is null or p_value <= 0
     or (p_kind = 'discount_percent' and p_value > 10000) then
    raise exception 'INVALID_DISCOUNT' using errcode = 'P0001';
  end if;

  v_tab := app.lock_open_tab(p_tab_id);
  v_tot := app.compute_tab_totals(v_tab.id);
  v_amount := case when p_kind = 'discount_percent'
                   then app.round_div((v_tot ->> 'subtotal')::bigint * p_value, 10000)
                   else p_value end;
  v_amount := least(v_amount, (v_tot ->> 'subtotal')::bigint - (v_tot ->> 'discount')::bigint);
  if v_amount <= 0 then
    raise exception 'NOTHING_TO_DISCOUNT' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('discount', v_tab.id) end;
  insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by, authorized_by)
  values (v_tab.id, p_kind, p_value, v_amount, btrim(p_reason), auth.uid(), v_auth)
  returning * into v_adj;

  v_totals := app.tab_after_change(v_tab.id);
  perform app.write_audit('tab.discount', 'tab_adjustments', v_adj.id, null, to_jsonb(v_adj), p_reason, v_auth);
  return app.finish_replay(p_idempotency_key,
    jsonb_build_object('adjustment_id', v_adj.id, 'amount', v_amount, 'totals', v_totals));
end $apply_discount$;

-- ---------------------------------------------------------------------------
-- app.merge_tabs(from, into) -> {from_tab_id, into_tab_id, totals (of into)}
-- Moves the source's orders and lines into the target, adds its covers, and
-- voids the source with merged_into_tab_id set. A source with payments
-- (append-only, they cannot move) or with discounts is refused.
-- ---------------------------------------------------------------------------
create or replace function app.merge_tabs(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = public as $merge_tabs$
declare
  v_from   tabs%rowtype;
  v_into   tabs%rowtype;
  v_totals jsonb;
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
  -- A discount was sized against the source alone (an amount is capped at its
  -- subtotal when applied): refused rather than carried across.
  if exists (select 1 from tab_adjustments a where a.tab_id = v_from.id) then
    raise exception 'MERGE_SOURCE_HAS_DISCOUNTS' using errcode = 'P0001';
  end if;

  update orders set tab_id = v_into.id where tab_id = v_from.id;
  update order_items set tab_id = v_into.id where tab_id = v_from.id;
  update tabs set covers = covers + v_from.covers where id = v_into.id;
  update tabs
     set status = 'void', closed_at = now(), merged_into_tab_id = v_into.id
   where id = v_from.id;

  v_totals := app.tab_after_change(v_into.id);
  perform app.write_audit('tab.merge', 'tabs', v_from.id, to_jsonb(v_from),
                          jsonb_build_object('merged_into_tab_id', v_into.id));
  return jsonb_build_object('from_tab_id', v_from.id, 'into_tab_id', v_into.id,
                            'totals', v_totals);
end $merge_tabs$;

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
                   else app.consume_pin_grant('cancel_tab', v_tab.id) end;
    update order_items
       set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, void_authorized_by = v_auth
     where tab_id = v_tab.id and voided_at is null;
  end if;

  update tabs set status = 'void', closed_at = now() where id = v_tab.id;
  perform app.write_audit('tab.cancel', 'tabs', v_tab.id, to_jsonb(v_tab),
                          jsonb_build_object('status', 'void'), p_reason, v_auth);
  return jsonb_build_object('tab_id', v_tab.id, 'status', 'void');
end $cancel_tab$;

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
                 else app.consume_pin_grant('void_item', v_line.id) end;
  update order_items
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, void_authorized_by = v_auth
   where id = v_line.id;

  v_totals := app.tab_after_change(v_tab.id);
  perform app.write_audit('order_item.void', 'order_items', v_line.id, to_jsonb(v_line),
                          jsonb_build_object('voided_by', auth.uid()), p_reason, v_auth);
  return jsonb_build_object('order_item_id', v_line.id, 'tab_id', v_tab.id, 'totals', v_totals);
end $void_item$;

revoke all on function app.apply_discount(uuid, adjustment_kind, bigint, text, text) from public, anon, authenticated;
revoke all on function app.merge_tabs(uuid, uuid) from public, anon, authenticated;
revoke all on function app.cancel_tab(uuid, text) from public, anon, authenticated;
revoke all on function app.void_item(uuid, text) from public, anon, authenticated;
grant execute on function app.apply_discount(uuid, adjustment_kind, bigint, text, text) to authenticated;
grant execute on function app.merge_tabs(uuid, uuid) to authenticated;
grant execute on function app.cancel_tab(uuid, text) to authenticated;
grant execute on function app.void_item(uuid, text) to authenticated;
