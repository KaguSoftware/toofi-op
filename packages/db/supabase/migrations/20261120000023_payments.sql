-- 0023 discounts, payments, splits and refunds. Cashier, manager and owner;
-- discount and refund need a manager PIN from a cashier.

-- ---------------------------------------------------------------------------
-- app.apply_discount(tab, kind, value, reason) -> {adjustment_id, amount, totals}
-- discount_percent: value in basis points of the subtotal (rounded half up);
-- discount_amount: value in IQD. Either is capped at what is left of the
-- subtotal after earlier discounts. PIN action 'discount'.
-- ---------------------------------------------------------------------------
create or replace function app.apply_discount(p_tab_id uuid, p_kind adjustment_kind, p_value bigint, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $apply_discount$
declare
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
                 else app.consume_pin_grant('discount') end;
  insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by, authorized_by)
  values (v_tab.id, p_kind, p_value, v_amount, btrim(p_reason), auth.uid(), v_auth)
  returning * into v_adj;

  v_totals := app.tab_after_change(v_tab.id);
  perform app.write_audit('tab.discount', 'tab_adjustments', v_adj.id, null, to_jsonb(v_adj), p_reason, v_auth);
  return jsonb_build_object('adjustment_id', v_adj.id, 'amount', v_amount, 'totals', v_totals);
end $apply_discount$;

-- ---------------------------------------------------------------------------
-- app.settle_tab(tab, method, amount, tendered, device, key)
--   -> {payment_id, tab_id, method, amount, tendered, change, till_shift_id,
--       status, totals}
-- A part payment is allowed; amount <= due. Cash: tendered >= amount, change =
-- tendered - amount. Card: tendered is ignored. At due = 0 the tab is settled.
-- ---------------------------------------------------------------------------
create or replace function app.settle_tab(
  p_tab_id          uuid,
  p_method          payment_method,
  p_amount          bigint,
  p_tendered        bigint,
  p_device_id       text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $settle_tab$
declare
  v_replay   jsonb;
  v_tab      tabs%rowtype;
  v_tot      jsonb;
  v_tendered bigint;
  v_pay      payments%rowtype;
  v_totals   jsonb;
  v_status   tab_status;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  -- Lock the tab before reading what is due: two settles queue here.
  v_tab := app.lock_open_tab(p_tab_id);
  if p_method is null or p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  v_tot := app.compute_tab_totals(v_tab.id);
  if p_amount > (v_tot ->> 'due')::bigint then
    raise exception 'OVERPAYMENT' using errcode = 'P0001';
  end if;
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < p_amount then
      raise exception 'TENDERED_TOO_LOW' using errcode = 'P0001';
    end if;
    v_tendered := p_tendered;
  end if;

  insert into payments (tab_id, method, amount, tendered, change, taken_by, device_id, idempotency_key)
  values (v_tab.id, p_method, p_amount, v_tendered, coalesce(v_tendered - p_amount, 0), auth.uid(),
          nullif(btrim(p_device_id), ''), p_idempotency_key)
  returning * into v_pay;

  v_totals := app.tab_after_change(v_tab.id);
  select t.status into v_status from tabs t where t.id = v_tab.id;
  perform app.write_audit('payment.take', 'payments', v_pay.id, null, to_jsonb(v_pay));
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'payment_id', v_pay.id, 'tab_id', v_tab.id, 'method', v_pay.method,
    'amount', v_pay.amount, 'tendered', v_pay.tendered, 'change', v_pay.change,
    'till_shift_id', v_pay.till_shift_id, 'status', v_status, 'totals', v_totals));
end $settle_tab$;

-- ---------------------------------------------------------------------------
-- app.split_evenly(tab, n) -> {due, shares[]}. Read-only. Same rule as
-- @rop/core splitEvenly: base = floor(due / n); the first (due mod n) shares
-- get base + 1.
-- ---------------------------------------------------------------------------
create or replace function app.split_evenly(p_tab_id uuid, p_n int) returns jsonb
language plpgsql stable security definer set search_path = public as $split_evenly$
declare
  v_due bigint;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_n is null or p_n < 1 or p_n > 100 then
    raise exception 'INVALID_SPLIT' using errcode = 'P0001';
  end if;
  v_due := (app.compute_tab_totals(p_tab_id) ->> 'due')::bigint;
  return jsonb_build_object(
    'due', v_due,
    'shares', (select jsonb_agg(v_due / p_n + case when i <= v_due % p_n then 1 else 0 end order by i)
                 from generate_series(1, p_n) i));
end $split_evenly$;

-- ---------------------------------------------------------------------------
-- app.split_by_item(tab, line ids) -> {amount, due, lines[{order_item_id,
-- line_total, discount, amount}]}. Read-only. Each line carries its share of
-- the tab discount (the same spread as compute_tab_totals); amount is capped
-- at due.
-- ---------------------------------------------------------------------------
create or replace function app.split_by_item(p_tab_id uuid, p_order_item_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $split_by_item$
declare
  v_due   bigint;
  v_lines jsonb;
  v_sum   bigint;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_order_item_ids is null or cardinality(p_order_item_ids) = 0 then
    raise exception 'INVALID_SPLIT' using errcode = 'P0001';
  end if;
  v_due := (app.compute_tab_totals(p_tab_id) ->> 'due')::bigint;

  select jsonb_agg(jsonb_build_object('order_item_id', x.order_item_id, 'line_total', x.line_total,
                                      'discount', x.discount, 'amount', x.line_total - x.discount)
                   order by x.order_item_id),
         sum(x.line_total - x.discount)
    into v_lines, v_sum
    from app.tab_line_discounts(p_tab_id) x
   where x.order_item_id = any (p_order_item_ids);
  if coalesce(jsonb_array_length(v_lines), 0) <> (select count(distinct u) from unnest(p_order_item_ids) u) then
    raise exception 'LINE_NOT_ON_TAB' using errcode = 'P0001';
  end if;

  return jsonb_build_object('amount', least(v_sum, v_due), 'due', v_due, 'lines', v_lines);
end $split_by_item$;

-- ---------------------------------------------------------------------------
-- app.refund(payment, amount, reason, key) -> {refund_id, payment_id, tab_id,
-- amount, method, till_shift_id, totals}. Only on a settled tab; amount <= the
-- payment less its earlier refunds. PIN action 'refund'.
-- ---------------------------------------------------------------------------
create or replace function app.refund(p_payment_id uuid, p_amount bigint, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $refund$
declare
  v_replay jsonb;
  v_pay    payments%rowtype;
  v_tab    tabs%rowtype;
  v_left   bigint;
  v_auth   uuid;
  v_ref    refunds%rowtype;
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

  select * into v_pay from payments p where p.id = p_payment_id and p.venue_id = app.current_venue();
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Lock order: the tab serialises refunds of its payments.
  select * into v_tab from tabs t where t.id = v_pay.tab_id for update;
  if v_tab.status <> 'settled' then
    raise exception 'TAB_NOT_SETTLED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  v_left := v_pay.amount - coalesce((select sum(r.amount) from refunds r where r.payment_id = v_pay.id), 0);
  if p_amount > v_left then
    raise exception 'OVER_REFUND' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('refund') end;
  insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by, authorized_by)
  values (v_pay.id, v_tab.id, p_amount, v_pay.method, btrim(p_reason), auth.uid(), v_auth)
  returning * into v_ref;

  perform app.write_audit('payment.refund', 'refunds', v_ref.id, null, to_jsonb(v_ref), p_reason, v_auth);
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'refund_id', v_ref.id, 'payment_id', v_pay.id, 'tab_id', v_tab.id,
    'amount', v_ref.amount, 'method', v_ref.method, 'till_shift_id', v_ref.till_shift_id,
    'totals', app.compute_tab_totals(v_tab.id)));
end $refund$;

revoke all on function app.apply_discount(uuid, adjustment_kind, bigint, text) from public, anon, authenticated;
revoke all on function app.settle_tab(uuid, payment_method, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function app.split_evenly(uuid, int) from public, anon, authenticated;
revoke all on function app.split_by_item(uuid, uuid[]) from public, anon, authenticated;
revoke all on function app.refund(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function app.apply_discount(uuid, adjustment_kind, bigint, text) to authenticated;
grant execute on function app.settle_tab(uuid, payment_method, bigint, bigint, text, text) to authenticated;
grant execute on function app.split_evenly(uuid, int) to authenticated;
grant execute on function app.split_by_item(uuid, uuid[]) to authenticated;
grant execute on function app.refund(uuid, bigint, text, text) to authenticated;
