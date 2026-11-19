-- 0024 till shifts: open with a float, stamp payments and refunds with the
-- device's open shift, blind close with variance, drawer events. Cashier,
-- manager and owner; closing another person's shift needs a manager PIN from
-- a cashier (action 'close_till_shift').
--
-- A missing shift never blocks money: the stamp is best effort and leaves
-- till_shift_id NULL when the device has no open shift.

-- ---------------------------------------------------------------------------
-- Stamp triggers. A payment takes the open shift of its own device; a refund
-- (which has no device) takes the open shift of the refunded payment's device.
-- FOR SHARE (payments -> refunds -> till_shifts in the lock order) makes a
-- concurrent close wait for this money, so its expected cash includes it.
-- ---------------------------------------------------------------------------
create or replace function app.stamp_payment_till_shift() returns trigger
language plpgsql security definer set search_path = public as $stamp_payment_till_shift$
begin
  if new.till_shift_id is null and new.device_id is not null then
    select s.id into new.till_shift_id
      from till_shifts s
     where s.venue_id = new.venue_id and s.device_id = new.device_id and s.closed_at is null
     for share;
  end if;
  return new;
end $stamp_payment_till_shift$;

create or replace function app.stamp_refund_till_shift() returns trigger
language plpgsql security definer set search_path = public as $stamp_refund_till_shift$
begin
  if new.till_shift_id is null then
    select s.id into new.till_shift_id
      from payments p
      join till_shifts s on s.venue_id = p.venue_id and s.device_id = p.device_id and s.closed_at is null
     where p.id = new.payment_id
     for share of s;
  end if;
  return new;
end $stamp_refund_till_shift$;

revoke all on function app.stamp_payment_till_shift() from public, anon, authenticated;
revoke all on function app.stamp_refund_till_shift() from public, anon, authenticated;

create trigger payments_stamp_till_shift before insert on payments
  for each row execute function app.stamp_payment_till_shift();
create trigger refunds_stamp_till_shift before insert on refunds
  for each row execute function app.stamp_refund_till_shift();

-- ---------------------------------------------------------------------------
-- app.open_till_shift(device, float) -> {shift_id, device_id, opened_at, opening_float}
-- One open shift per device and per staff member.
-- ---------------------------------------------------------------------------
create or replace function app.open_till_shift(p_device_id text, p_opening_float bigint) returns jsonb
language plpgsql security definer set search_path = public as $open_till_shift$
declare
  v_shift      till_shifts%rowtype;
  v_constraint text;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'DEVICE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if exists (select 1 from till_shifts s
              where s.staff_id = auth.uid() and s.venue_id = app.current_venue() and s.closed_at is null) then
    raise exception 'SHIFT_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  begin
    insert into till_shifts (staff_id, device_id, opening_float)
    values (auth.uid(), btrim(p_device_id), p_opening_float)
    returning * into v_shift;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'till_shifts_one_open_per_device' then
      raise exception 'SHIFT_ALREADY_OPEN' using errcode = 'P0001';
    end if;
    raise;
  end;

  perform app.write_audit('till_shift.open', 'till_shifts', v_shift.id, null, to_jsonb(v_shift));
  return jsonb_build_object('shift_id', v_shift.id, 'device_id', v_shift.device_id,
                            'opened_at', v_shift.opened_at, 'opening_float', v_shift.opening_float);
end $open_till_shift$;

-- ---------------------------------------------------------------------------
-- Internal: close a locked open shift. expected = opening float + cash
-- payments - cash refunds stamped with the shift (floored at 0, since the
-- column is unsigned); variance = counted - expected.
-- ---------------------------------------------------------------------------
create or replace function app.close_shift(p_shift till_shifts, p_counted_cash bigint, p_authorized_by uuid)
returns jsonb
language plpgsql security definer set search_path = public as $close_shift$
declare
  v_expected bigint;
  v_shift    till_shifts%rowtype;
begin
  v_expected := greatest(
    p_shift.opening_float
      + coalesce((select sum(p.amount) from payments p
                   where p.till_shift_id = p_shift.id and p.method = 'cash'), 0)
      - coalesce((select sum(r.amount) from refunds r
                   where r.till_shift_id = p_shift.id and r.method = 'cash'), 0),
    0);

  update till_shifts
     set closed_at = now(), closed_by = auth.uid(), counted_cash = p_counted_cash,
         expected_cash = v_expected, variance = p_counted_cash - v_expected
   where id = p_shift.id
   returning * into v_shift;

  perform app.write_audit('till_shift.close', 'till_shifts', v_shift.id, to_jsonb(p_shift), to_jsonb(v_shift),
                          null, p_authorized_by);
  return jsonb_build_object('shift_id', v_shift.id, 'device_id', v_shift.device_id,
                            'opening_float', v_shift.opening_float, 'counted_cash', v_shift.counted_cash,
                            'expected_cash', v_shift.expected_cash, 'variance', v_shift.variance,
                            'closed_at', v_shift.closed_at);
end $close_shift$;

revoke all on function app.close_shift(till_shifts, bigint, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.close_till_shift(counted) -> {shift_id, device_id, opening_float,
-- counted_cash, expected_cash, variance, closed_at}: the caller's own open
-- shift. Blind count: expected is only ever returned here, after the close.
-- ---------------------------------------------------------------------------
create or replace function app.close_till_shift(p_counted_cash bigint) returns jsonb
language plpgsql security definer set search_path = public as $close_till_shift$
declare
  v_shift till_shifts%rowtype;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  select * into v_shift from till_shifts s
   where s.staff_id = auth.uid() and s.venue_id = app.current_venue() and s.closed_at is null
   for update;
  if not found then
    raise exception 'NO_OPEN_SHIFT' using errcode = 'P0001';
  end if;
  return app.close_shift(v_shift, p_counted_cash, null);
end $close_till_shift$;

-- ---------------------------------------------------------------------------
-- app.close_till_shift_for(shift, counted) -> same shape as close_till_shift.
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
                 else app.consume_pin_grant('close_till_shift') end;
  return app.close_shift(v_shift, p_counted_cash, v_auth);
end $close_till_shift_for$;

-- ---------------------------------------------------------------------------
-- app.till_shift_status(device) -> {open: false}
--   | {open: true, shift_id, staff_id, staff_name, device_id, opened_at, opening_float}
-- Never the expected cash (blind count).
-- ---------------------------------------------------------------------------
create or replace function app.till_shift_status(p_device_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $till_shift_status$
declare
  v_out jsonb;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select jsonb_build_object('open', true, 'shift_id', s.id, 'staff_id', s.staff_id, 'staff_name', st.full_name,
                            'device_id', s.device_id, 'opened_at', s.opened_at, 'opening_float', s.opening_float)
    into v_out
    from till_shifts s
    join staff st on st.id = s.staff_id
   where s.venue_id = app.current_venue() and s.device_id = btrim(p_device_id) and s.closed_at is null;
  return coalesce(v_out, jsonb_build_object('open', false));
end $till_shift_status$;

-- ---------------------------------------------------------------------------
-- app.record_drawer_open(reason) -> {event_id, till_shift_id}: a "no sale"
-- drawer open on the caller's own open shift.
-- ---------------------------------------------------------------------------
create or replace function app.record_drawer_open(p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $record_drawer_open$
declare
  v_shift uuid;
  v_event drawer_events%rowtype;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select s.id into v_shift from till_shifts s
   where s.staff_id = auth.uid() and s.venue_id = app.current_venue() and s.closed_at is null;
  if v_shift is null then
    raise exception 'NO_OPEN_SHIFT' using errcode = 'P0001';
  end if;

  insert into drawer_events (till_shift_id, staff_id, reason)
  values (v_shift, auth.uid(), btrim(p_reason))
  returning * into v_event;
  perform app.write_audit('drawer.open', 'drawer_events', v_event.id, null, to_jsonb(v_event), p_reason);
  return jsonb_build_object('event_id', v_event.id, 'till_shift_id', v_shift);
end $record_drawer_open$;

revoke all on function app.open_till_shift(text, bigint) from public, anon, authenticated;
revoke all on function app.close_till_shift(bigint) from public, anon, authenticated;
revoke all on function app.close_till_shift_for(uuid, bigint) from public, anon, authenticated;
revoke all on function app.till_shift_status(text) from public, anon, authenticated;
revoke all on function app.record_drawer_open(text) from public, anon, authenticated;
grant execute on function app.open_till_shift(text, bigint) to authenticated;
grant execute on function app.close_till_shift(bigint) to authenticated;
grant execute on function app.close_till_shift_for(uuid, bigint) to authenticated;
grant execute on function app.till_shift_status(text) to authenticated;
grant execute on function app.record_drawer_open(text) to authenticated;
