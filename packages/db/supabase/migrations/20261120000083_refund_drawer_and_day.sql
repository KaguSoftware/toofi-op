-- 0083 which drawer and which business day money lands in (review fixes).
--
-- REFUND DRAWER. A refund now names the device it is given back at
-- (refunds.device_id) and is stamped with THAT device's open shift, not the
-- shift of the device that took the original payment: the cash leaves the
-- drawer of the till doing the refund.
--
-- SOMEONE ELSE'S DRAWER (decided: never refuse money). settle_tab and refund
-- stamp the device's open shift whoever owns it. When a CASH payment or refund
-- lands in a shift that belongs to another staff member, the money is still
-- recorded and stamped to that shift (that is where the cash physically is, so
-- the drawer's expected cash stays right), and the mismatch is audited:
-- 'payment.shift_mismatch' / 'refund.shift_mismatch' with {till_shift_id,
-- shift_staff_id, device_id}. Card money moves no cash, so it is not audited.
--
-- REFUND BUSINESS DAY. A refund belongs to the day it was given back in
-- (refunds.day_session_id), not to its tab's day, so a refund after the tab's
-- day closed lands in the next day's summary instead of none. refund() takes
-- the open day FOR SHARE first (lock order: day_sessions -> tabs ...), so it
-- cannot race close_day, which takes the day FOR UPDATE. With no day open a
-- refund is refused with DAY_NOT_OPEN (decided: open the day, then refund).
-- close_day counts refunds (and the cash and card nets) by refunds.day_session_id.
--
-- Signature change: refund(uuid, bigint, text, text) ->
--   refund(p_payment_id uuid, p_amount bigint, p_reason text, p_device_id text, p_idempotency_key text).
-- Its PIN grant is matched to the payment (entity = payments.id); the grant
-- for close_till_shift_for is matched to the shift.

alter table refunds add column device_id text;
alter table refunds add column day_session_id uuid references day_sessions (id);
create index refunds_day_session on refunds (day_session_id);

-- Earlier refunds: the day of their tab (what close_day counted them under).
alter table refunds disable trigger refunds_append_only;
update refunds r set day_session_id = t.day_session_id from tabs t where t.id = r.tab_id;
alter table refunds enable trigger refunds_append_only;
alter table refunds alter column day_session_id set not null;

-- ---------------------------------------------------------------------------
-- Stamp triggers for refunds. The shift: the open shift of the refund's own
-- device (FOR SHARE, as for payments, so a concurrent close waits for it).
-- The day: refund() passes the open day; a row inserted without one (fixtures)
-- takes the open day, else its tab's day.
-- ---------------------------------------------------------------------------
create or replace function app.stamp_refund_till_shift() returns trigger
language plpgsql security definer set search_path = public as $stamp_refund_till_shift$
begin
  if new.till_shift_id is null and new.device_id is not null then
    select s.id into new.till_shift_id
      from till_shifts s
     where s.venue_id = new.venue_id and s.device_id = new.device_id and s.closed_at is null
     for share;
  end if;
  return new;
end $stamp_refund_till_shift$;

create or replace function app.stamp_refund_day() returns trigger
language plpgsql security definer set search_path = public as $stamp_refund_day$
begin
  if new.day_session_id is null then
    new.day_session_id := coalesce(
      (select d.id from day_sessions d where d.venue_id = new.venue_id and d.closed_at is null),
      (select t.day_session_id from tabs t where t.id = new.tab_id));
  end if;
  return new;
end $stamp_refund_day$;

revoke all on function app.stamp_refund_till_shift() from public, anon, authenticated;
revoke all on function app.stamp_refund_day() from public, anon, authenticated;

create trigger refunds_stamp_day before insert on refunds
  for each row execute function app.stamp_refund_day();

-- Internal: audit cash that landed in a shift owned by someone other than the caller.
create or replace function app.audit_shift_mismatch(
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_method    payment_method,
  p_shift_id  uuid,
  p_device_id text
) returns void
language plpgsql security definer set search_path = public as $audit_shift_mismatch$
declare
  v_owner uuid;
begin
  if p_method <> 'cash' or p_shift_id is null then
    return;
  end if;
  select s.staff_id into v_owner from till_shifts s where s.id = p_shift_id;
  if v_owner is distinct from auth.uid() then
    perform app.write_audit(p_action, p_entity, p_entity_id, null,
                            jsonb_build_object('till_shift_id', p_shift_id, 'shift_staff_id', v_owner,
                                               'device_id', p_device_id));
  end if;
end $audit_shift_mismatch$;

revoke all on function app.audit_shift_mismatch(text, text, uuid, payment_method, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.settle_tab: as 0023, plus the shift-mismatch audit.
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
  perform app.audit_shift_mismatch('payment.shift_mismatch', 'payments', v_pay.id, v_pay.method,
                                   v_pay.till_shift_id, v_pay.device_id);
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'payment_id', v_pay.id, 'tab_id', v_tab.id, 'method', v_pay.method,
    'amount', v_pay.amount, 'tendered', v_pay.tendered, 'change', v_pay.change,
    'till_shift_id', v_pay.till_shift_id, 'status', v_status, 'totals', v_totals));
end $settle_tab$;

-- ---------------------------------------------------------------------------
-- app.refund(payment, amount, reason, device, key) -> {refund_id, payment_id,
-- tab_id, amount, method, till_shift_id, day_session_id, totals}. Only on a
-- settled tab, while a day is open; amount <= the payment less its earlier
-- refunds. PIN action 'refund' (entity: the payment).
-- ---------------------------------------------------------------------------
drop function app.refund(uuid, bigint, text, text);

create function app.refund(
  p_payment_id      uuid,
  p_amount          bigint,
  p_reason          text,
  p_device_id       text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $refund$
declare
  v_replay jsonb;
  v_day    uuid;
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
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'DEVICE_REQUIRED' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions first. FOR SHARE: close_day waits for this refund.
  select d.id into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null
   for share;
  if v_day is null then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;

  select * into v_pay from payments p where p.id = p_payment_id and p.venue_id = app.current_venue();
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- The tab serialises refunds of its payments.
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
                 else app.consume_pin_grant('refund', v_pay.id) end;
  insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by, authorized_by,
                       device_id, day_session_id)
  values (v_pay.id, v_tab.id, p_amount, v_pay.method, btrim(p_reason), auth.uid(), v_auth,
          btrim(p_device_id), v_day)
  returning * into v_ref;

  perform app.write_audit('payment.refund', 'refunds', v_ref.id, null, to_jsonb(v_ref), p_reason, v_auth);
  perform app.audit_shift_mismatch('refund.shift_mismatch', 'refunds', v_ref.id, v_ref.method,
                                   v_ref.till_shift_id, v_ref.device_id);
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'refund_id', v_ref.id, 'payment_id', v_pay.id, 'tab_id', v_tab.id,
    'amount', v_ref.amount, 'method', v_ref.method, 'till_shift_id', v_ref.till_shift_id,
    'day_session_id', v_ref.day_session_id,
    'totals', app.compute_tab_totals(v_tab.id)));
end $refund$;

-- ---------------------------------------------------------------------------
-- app.close_day(): as 0021, but refunds (and the cash and card nets) are the
-- refunds GIVEN BACK during this day, whichever day their tab belonged to.
--   gross, discounts: the day's settled tabs; refunds: this day's refunds;
--   net = gross - discounts - refunds; cash / card = the day's tabs' payments
--   less this day's refunds, per method (cash + card = net).
-- ---------------------------------------------------------------------------
create or replace function app.close_day() returns jsonb
language plpgsql security definer set search_path = public as $close_day$
declare
  v_day     day_sessions%rowtype;
  v_summary jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions first. open_tab and refund take this row FOR
  -- SHARE, so no tab is opened and no refund given while the close runs.
  select * into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null
   for update;
  if not found then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from tabs t where t.venue_id = v_day.venue_id and t.status = 'open') then
    raise exception 'OPEN_TABS_EXIST' using errcode = 'P0001';
  end if;

  with settled as (
    select t.id, t.covers, app.compute_tab_totals(t.id) as tt
      from tabs t
     where t.day_session_id = v_day.id and t.status = 'settled'
  ), money as (
    select
      coalesce((select sum(p.amount) from payments p join tabs t on t.id = p.tab_id
                 where t.day_session_id = v_day.id and p.method = 'cash'), 0)
      - coalesce((select sum(r.amount) from refunds r
                   where r.day_session_id = v_day.id and r.method = 'cash'), 0) as cash,
      coalesce((select sum(p.amount) from payments p join tabs t on t.id = p.tab_id
                 where t.day_session_id = v_day.id and p.method = 'card'), 0)
      - coalesce((select sum(r.amount) from refunds r
                   where r.day_session_id = v_day.id and r.method = 'card'), 0) as card,
      coalesce((select sum(r.amount) from refunds r where r.day_session_id = v_day.id), 0) as refunds
  ), voids as (
    select count(*) as n, coalesce(sum(oi.line_total), 0) as value
      from order_items oi join tabs t on t.id = oi.tab_id
     where t.day_session_id = v_day.id and oi.voided_at is not null
  ), agg as (
    select coalesce(sum((s.tt ->> 'subtotal')::bigint), 0) as gross,
           coalesce(sum((s.tt ->> 'discount')::bigint), 0) as discounts,
           coalesce(sum(s.covers), 0) as covers,
           count(*) as tabs
      from settled s
  )
  select jsonb_build_object(
           'gross', agg.gross,
           'discounts', agg.discounts,
           'refunds', money.refunds,
           'net', agg.gross - agg.discounts - money.refunds,
           'cash', money.cash,
           'card', money.card,
           'voids_count', voids.n,
           'voids_value', voids.value,
           'covers', agg.covers,
           'tabs', agg.tabs)
    into v_summary
    from agg, money, voids;

  update day_sessions
     set closed_at = now(), closed_by = auth.uid(), summary = v_summary
   where id = v_day.id
   returning * into v_day;

  perform app.write_audit('day.close', 'day_sessions', v_day.id, null, to_jsonb(v_day));
  return jsonb_build_object('day_session_id', v_day.id,
                            'business_date', v_day.business_date,
                            'closed_at', v_day.closed_at,
                            'summary', v_summary);
end $close_day$;

-- ---------------------------------------------------------------------------
-- app.close_till_shift_for: as 0024; its PIN grant is matched to the shift.
-- ---------------------------------------------------------------------------
create or replace function app.close_till_shift_for(p_shift_id uuid, p_counted_cash bigint) returns jsonb
language plpgsql security definer set search_path = public as $close_till_shift_for$
declare
  v_shift till_shifts%rowtype;
  v_auth  uuid;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  select * into v_shift from till_shifts s
   where s.id = p_shift_id and s.venue_id = app.current_venue() and s.closed_at is null
   for update;
  if not found then
    raise exception 'SHIFT_NOT_OPEN' using errcode = 'P0001';
  end if;
  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('close_till_shift', v_shift.id) end;
  return app.close_shift(v_shift, p_counted_cash, v_auth);
end $close_till_shift_for$;

revoke all on function app.settle_tab(uuid, payment_method, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function app.refund(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function app.close_day() from public, anon, authenticated;
revoke all on function app.close_till_shift_for(uuid, bigint) from public, anon, authenticated;
grant execute on function app.settle_tab(uuid, payment_method, bigint, bigint, text, text) to authenticated;
grant execute on function app.refund(uuid, bigint, text, text, text) to authenticated;
grant execute on function app.close_day() to authenticated;
grant execute on function app.close_till_shift_for(uuid, bigint) to authenticated;
