-- 0021 business day: app.open_day() and app.close_day(). Manager and owner.

-- ---------------------------------------------------------------------------
-- app.open_day() -> {day_session_id, business_date, opened_at}
-- DAY_ALREADY_OPEN while a day is open; DAY_ALREADY_CLOSED when today's
-- business date has already been opened and closed.
-- ---------------------------------------------------------------------------
create or replace function app.open_day() returns jsonb
language plpgsql security definer set search_path = public as $open_day$
declare
  v_day day_sessions%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from day_sessions d where d.venue_id = app.current_venue() and d.closed_at is null) then
    raise exception 'DAY_ALREADY_OPEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from day_sessions d
              where d.venue_id = app.current_venue() and d.business_date = app.business_date()) then
    raise exception 'DAY_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  begin
    insert into day_sessions (business_date, opened_by)
    values (app.business_date(), auth.uid())
    returning * into v_day;
  exception when unique_violation then
    -- Lost a race with another open_day.
    raise exception 'DAY_ALREADY_OPEN' using errcode = 'P0001';
  end;

  perform app.write_audit('day.open', 'day_sessions', v_day.id, null, to_jsonb(v_day));
  return jsonb_build_object('day_session_id', v_day.id,
                            'business_date', v_day.business_date,
                            'opened_at', v_day.opened_at);
end $open_day$;

-- ---------------------------------------------------------------------------
-- app.close_day() -> {day_session_id, business_date, closed_at, summary}
-- OPEN_TABS_EXIST while any tab of the venue is open. The summary covers the
-- day's settled tabs:
--   gross (subtotals), discounts, refunds, net = gross - discounts - refunds,
--   cash and card (payments less refunds, per method; cash + card = net),
--   voids_count / voids_value (voided lines of all the day's tabs),
--   covers, tabs (settled tabs).
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

  -- Lock order: day_sessions first. open_tab takes this row FOR SHARE, so no
  -- tab can be opened while the close runs.
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
      - coalesce((select sum(r.amount) from refunds r join tabs t on t.id = r.tab_id
                   where t.day_session_id = v_day.id and r.method = 'cash'), 0) as cash,
      coalesce((select sum(p.amount) from payments p join tabs t on t.id = p.tab_id
                 where t.day_session_id = v_day.id and p.method = 'card'), 0)
      - coalesce((select sum(r.amount) from refunds r join tabs t on t.id = r.tab_id
                   where t.day_session_id = v_day.id and r.method = 'card'), 0) as card,
      coalesce((select sum(r.amount) from refunds r join tabs t on t.id = r.tab_id
                 where t.day_session_id = v_day.id), 0) as refunds
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

revoke all on function app.open_day() from public, anon, authenticated;
revoke all on function app.close_day() from public, anon, authenticated;
grant execute on function app.open_day() to authenticated;
grant execute on function app.close_day() to authenticated;
