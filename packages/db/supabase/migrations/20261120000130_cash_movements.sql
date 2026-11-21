-- 0130 cash movements: cash that enters or leaves the drawer without a sale.
--
-- Until now the till knew only payments and refunds, so a cashier who paid a
-- supplier from the drawer ended the shift with a false shortage. Three kinds:
--   paid_out  cash taken out to pay for something (a supplier, a gas bottle)
--   pay_in    cash put in that is not a sale (change from the bank)
--   drop      cash moved from the drawer to the safe
--
--   cash_movements: append-only, like payments. One row per movement, on the
--     actor's own open till shift, stamped with the open business day if any.
--   app.record_cash_movement(kind, amount, reason, key): cashier, manager, owner.
--     A cashier needs a manager PIN grant for action 'cash_movement', bound to the
--     shift and the amount; a manager or owner is their own authorizer.
--   app.close_shift: expected cash = opening float + cash payments + pay-ins
--     - cash refunds - paid-outs - drops (still floored at 0). Its result also
--     carries pay_ins, paid_outs and drops, so the close screen can explain the
--     expected figure. It is still only ever returned after the close (blind count).
--   app.close_day: the summary gains paid_outs, pay_ins and drops, the movements
--     made while this day was open.
--
-- A movement never needs an open business day (a supplier may be paid before
-- opening); it does need an open shift, because it belongs to a drawer.

create type cash_movement_kind as enum ('paid_out', 'pay_in', 'drop');

create table cash_movements (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null default app.current_venue() references venues (id),
  till_shift_id   uuid not null references till_shifts (id),
  day_session_id  uuid references day_sessions (id),
  kind            cash_movement_kind not null,
  amount          iqd  not null check (amount > 0),
  reason          text not null check (btrim(reason) <> ''),
  staff_id        uuid not null references staff (id),
  authorized_by   uuid references staff (id),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index cash_movements_till_shift on cash_movements (till_shift_id);
create index cash_movements_day_session on cash_movements (day_session_id);
create index cash_movements_venue_created on cash_movements (venue_id, created_at);

-- Append-only, as payments and refunds.
revoke update, delete, truncate on cash_movements from service_role;
create trigger cash_movements_append_only
  before update or delete or truncate on cash_movements
  for each statement execute function app.forbid_mutation();

-- RLS: select-only. A cashier reads the movements they made; managers and owners
-- read all of the venue's. No client writes.
alter table cash_movements enable row level security;
revoke all on cash_movements from anon, authenticated;
grant select on cash_movements to authenticated;
create policy cash_movements_own_or_manager_read on cash_movements for select to authenticated
  using (venue_id = (select app.current_venue())
         and (select app.staff_role()) is not null
         and (staff_id = (select auth.uid()) or (select app.is_staff('manager', 'owner'))));

-- ---------------------------------------------------------------------------
-- app.record_cash_movement(kind, amount, reason, key)
--   -> {movement_id, till_shift_id, kind, amount, created_at}
-- Never the expected cash (blind count).
-- ---------------------------------------------------------------------------
create or replace function app.record_cash_movement(
  p_kind            cash_movement_kind,
  p_amount          bigint,
  p_reason          text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $record_cash_movement$
declare
  v_replay jsonb;
  v_day    uuid;
  v_shift  uuid;
  v_auth   uuid;
  v_move   cash_movements%rowtype;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_kind is null then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions first. FOR SHARE: close_day waits for this movement.
  -- No open day is fine; the movement is then only on the shift.
  select d.id into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null
   for share;

  -- FOR SHARE on the shift: a concurrent close waits, so its expected cash includes this.
  select s.id into v_shift from till_shifts s
   where s.staff_id = auth.uid() and s.venue_id = app.current_venue() and s.closed_at is null
   for share;
  if v_shift is null then
    raise exception 'NO_OPEN_SHIFT' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('cash_movement', v_shift, p_amount) end;

  insert into cash_movements (till_shift_id, day_session_id, kind, amount, reason, staff_id, authorized_by, idempotency_key)
  values (v_shift, v_day, p_kind, p_amount, btrim(p_reason), auth.uid(), v_auth, p_idempotency_key)
  returning * into v_move;

  perform app.write_audit('cash_movement.' || v_move.kind::text, 'cash_movements', v_move.id, null,
                          to_jsonb(v_move), v_move.reason, v_auth);
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'movement_id', v_move.id, 'till_shift_id', v_move.till_shift_id, 'kind', v_move.kind,
    'amount', v_move.amount, 'created_at', v_move.created_at));
end $record_cash_movement$;

revoke all on function app.record_cash_movement(cash_movement_kind, bigint, text, text) from public, anon, authenticated;
grant execute on function app.record_cash_movement(cash_movement_kind, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.close_shift: as 0122, but the expected cash counts the shift's cash
-- movements, and the result names them.
-- ---------------------------------------------------------------------------
create or replace function app.close_shift(p_shift till_shifts, p_counted_cash bigint, p_authorized_by uuid)
returns jsonb
language plpgsql security definer set search_path = public as $close_shift$
declare
  v_pay_ins   bigint;
  v_paid_outs bigint;
  v_drops     bigint;
  v_expected  bigint;
  v_shift     till_shifts%rowtype;
  v_threshold bigint;
begin
  select coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0),
         coalesce(sum(m.amount) filter (where m.kind = 'paid_out'), 0),
         coalesce(sum(m.amount) filter (where m.kind = 'drop'), 0)
    into v_pay_ins, v_paid_outs, v_drops
    from cash_movements m
   where m.till_shift_id = p_shift.id;

  v_expected := greatest(
    p_shift.opening_float
      + coalesce((select sum(p.amount) from payments p
                   where p.till_shift_id = p_shift.id and p.method = 'cash'), 0)
      - coalesce((select sum(r.amount) from refunds r
                   where r.till_shift_id = p_shift.id and r.method = 'cash'), 0)
      + v_pay_ins - v_paid_outs - v_drops,
    0);

  update till_shifts
     set closed_at = now(), closed_by = auth.uid(), counted_cash = p_counted_cash,
         expected_cash = v_expected, variance = p_counted_cash - v_expected
   where id = p_shift.id
   returning * into v_shift;

  perform app.write_audit('till_shift.close', 'till_shifts', v_shift.id, to_jsonb(p_shift), to_jsonb(v_shift),
                          null, p_authorized_by);

  v_threshold := app.variance_alert_threshold(v_shift.venue_id);
  if abs(v_shift.variance) >= v_threshold then
    perform app.write_audit('till_shift.variance_alert', 'till_shifts', v_shift.id, null,
                            jsonb_build_object('variance', v_shift.variance, 'threshold', v_threshold,
                                               'expected_cash', v_shift.expected_cash,
                                               'counted_cash', v_shift.counted_cash,
                                               'staff_id', v_shift.staff_id, 'device_id', v_shift.device_id),
                            null, p_authorized_by);
  end if;

  return jsonb_build_object('shift_id', v_shift.id, 'device_id', v_shift.device_id,
                            'opening_float', v_shift.opening_float, 'counted_cash', v_shift.counted_cash,
                            'expected_cash', v_shift.expected_cash, 'variance', v_shift.variance,
                            'pay_ins', v_pay_ins, 'paid_outs', v_paid_outs, 'drops', v_drops,
                            'closed_at', v_shift.closed_at);
end $close_shift$;

revoke all on function app.close_shift(till_shifts, bigint, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.close_day(): as 0083, plus paid_outs, pay_ins and drops: the cash
-- movements made while this day was open. They do not change net, cash or card,
-- which describe sales; they explain where drawer cash went.
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

  -- Lock order: day_sessions first. open_tab, refund and record_cash_movement take
  -- this row FOR SHARE, so none of them runs while the close does.
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
  ), moves as (
    select coalesce(sum(m.amount) filter (where m.kind = 'paid_out'), 0) as paid_outs,
           coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0) as pay_ins,
           coalesce(sum(m.amount) filter (where m.kind = 'drop'), 0) as drops
      from cash_movements m
     where m.day_session_id = v_day.id
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
           'tabs', agg.tabs,
           'paid_outs', moves.paid_outs,
           'pay_ins', moves.pay_ins,
           'drops', moves.drops)
    into v_summary
    from agg, money, voids, moves;

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

revoke all on function app.close_day() from public, anon, authenticated;
grant execute on function app.close_day() to authenticated;
