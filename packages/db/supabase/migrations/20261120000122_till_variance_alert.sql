-- 0122 till variance alerts.
--
-- Product decision: the blind till count is a UI rule only (a cashier can read
-- their own shift row), so managers get variance visibility instead.
--
--   venue_settings.variance_alert_iqd (iqd, default 5,000): a closed shift whose
--     |variance| >= this is an alert. Owner sets it through update_venue_settings.
--   close_till_shift / close_till_shift_for: both close through app.close_shift,
--     which now writes the audit row 'till_shift.variance_alert'
--     (entity till_shifts, after {variance, threshold, expected_cash,
--     counted_cash, staff_id, device_id}) when the variance reaches it.
--   app.shift_variances(p_from, p_to): manager and owner.
--
-- Signature change: update_venue_settings(text, text, text, text, text, int) ->
--   (... the same six, p_variance_alert_iqd bigint default null).

alter table venue_settings add column variance_alert_iqd iqd not null default 5000;

-- Internal: the venue's alert threshold (5,000 with no settings row).
create or replace function app.variance_alert_threshold(p_venue_id uuid) returns bigint
language sql stable security definer set search_path = public as $variance_alert_threshold$
  select coalesce((select s.variance_alert_iqd from venue_settings s where s.venue_id = p_venue_id), 5000)
$variance_alert_threshold$;

revoke all on function app.variance_alert_threshold(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.close_shift: as 0024, plus the variance alert audit.
-- ---------------------------------------------------------------------------
create or replace function app.close_shift(p_shift till_shifts, p_counted_cash bigint, p_authorized_by uuid)
returns jsonb
language plpgsql security definer set search_path = public as $close_shift$
declare
  v_expected  bigint;
  v_shift     till_shifts%rowtype;
  v_threshold bigint;
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
                            'closed_at', v_shift.closed_at);
end $close_shift$;

revoke all on function app.close_shift(till_shifts, bigint, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.shift_variances(p_from, p_to) -> {from, to, threshold, shifts: [{shift_id,
--   staff_id, staff_name, device_id, opened_at, closed_at, opening_float,
--   expected_cash, counted_cash, variance, alert}]}
-- Closed shifts whose close falls in [p_from, p_to] by business date (venue time
-- zone), newest close first. alert = |variance| >= threshold (the current
-- setting). Manager and owner; FORBIDDEN / INVALID_RANGE as the analytics.
-- ---------------------------------------------------------------------------
create or replace function app.shift_variances(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $shift_variances$
declare
  v_venue     uuid := app.current_venue();
  v_tz        text;
  v_threshold bigint;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz := app.venue_timezone();
  v_threshold := app.variance_alert_threshold(v_venue);

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'threshold', v_threshold,
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'shift_id', s.id, 'staff_id', s.staff_id, 'staff_name', st.full_name,
               'device_id', s.device_id, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
               'opening_float', s.opening_float, 'expected_cash', s.expected_cash,
               'counted_cash', s.counted_cash, 'variance', s.variance,
               'alert', abs(s.variance) >= v_threshold)
             order by s.closed_at desc, s.id)
        from till_shifts s
        join staff st on st.id = s.staff_id
       where s.venue_id = v_venue
         and s.closed_at is not null
         and s.closed_at >= p_from::timestamp at time zone v_tz
         and s.closed_at < (p_to + 1)::timestamp at time zone v_tz), '[]'::jsonb));
end $shift_variances$;

revoke all on function app.shift_variances(date, date) from public, anon, authenticated;
grant execute on function app.shift_variances(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- app.update_venue_settings: as 0063, plus p_variance_alert_iqd (>= 0, else
-- SETTINGS_INVALID). A null argument leaves that setting unchanged.
-- ---------------------------------------------------------------------------
drop function app.update_venue_settings(text, text, text, text, text, int);

create function app.update_venue_settings(
  p_venue_name text default null,
  p_receipt_header_en text default null,
  p_receipt_header_ar text default null,
  p_receipt_footer_en text default null,
  p_receipt_footer_ar text default null,
  p_service_charge_bps int default null,
  p_variance_alert_iqd bigint default null
) returns void
language plpgsql security definer set search_path = public as $update_venue_settings$
declare
  v_venue uuid := app.current_venue();
  v_before jsonb;
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_venue_name is not null and btrim(p_venue_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_service_charge_bps is not null and (p_service_charge_bps < 0 or p_service_charge_bps > 10000) then
    raise exception 'SETTINGS_INVALID' using errcode = 'P0001';
  end if;
  if p_variance_alert_iqd is not null and p_variance_alert_iqd < 0 then
    raise exception 'SETTINGS_INVALID' using errcode = 'P0001';
  end if;

  insert into venue_settings (venue_id) values (v_venue) on conflict (venue_id) do nothing;
  select to_jsonb(s) || jsonb_build_object('venue_name', v.name) into v_before
    from venue_settings s join venues v on v.id = s.venue_id
   where s.venue_id = v_venue for update of s;

  update venue_settings
     set receipt_header_en  = coalesce(p_receipt_header_en, receipt_header_en),
         receipt_header_ar  = coalesce(p_receipt_header_ar, receipt_header_ar),
         receipt_footer_en  = coalesce(p_receipt_footer_en, receipt_footer_en),
         receipt_footer_ar  = coalesce(p_receipt_footer_ar, receipt_footer_ar),
         service_charge_bps = coalesce(p_service_charge_bps, service_charge_bps),
         variance_alert_iqd = coalesce(p_variance_alert_iqd, variance_alert_iqd)
   where venue_id = v_venue;
  if p_venue_name is not null then
    update venues set name = btrim(p_venue_name) where id = v_venue;
  end if;

  perform app.write_audit('venue_settings.update', 'venue_settings', v_venue, v_before,
    (select to_jsonb(s) || jsonb_build_object('venue_name', v.name)
       from venue_settings s join venues v on v.id = s.venue_id where s.venue_id = v_venue));
end $update_venue_settings$;

revoke all on function app.update_venue_settings(text, text, text, text, text, int, bigint)
  from public, anon, authenticated;
grant execute on function app.update_venue_settings(text, text, text, text, text, int, bigint) to authenticated;
