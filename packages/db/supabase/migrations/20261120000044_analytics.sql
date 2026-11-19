-- 0044 analytics and reports. Manager and owner only (FORBIDDEN otherwise).
--
-- Posture
--  * Every function is `stable security definer`, returns jsonb, and starts with
--    app.analytics_guard(p_from, p_to): FORBIDDEN unless manager/owner, then
--    INVALID_RANGE for a NULL bound, p_to < p_from or a span over 366 days.
--    Definer bodies bypass RLS, so every query filters venue_id = current venue.
--  * Business dates: an event belongs to the calendar date of its own timestamp
--    in the venue time zone (Asia/Baghdad), as app.business_date does. The range
--    [p_from, p_to] is inclusive and becomes one timestamptz window
--    [p_from 00:00 local, p_to + 1 00:00 local).
--  * Exclusions everywhere: tabs with status 'void' and tabs merged away
--    (merged_into_tab_id is not null), with all their lines, discounts, payments
--    and refunds.
--  * Money: net = payments - refunds, each dated by its own created_at (cash /
--    card by method). gross = sum of non-voided line_total (pre-discount), dated
--    by the line's created_at (the Send); open tabs count. discounts =
--    tab_adjustments.amount by created_at. voids = line_total of voided lines by
--    voided_at. tabs / covers = tabs by opened_at. All money is integer IQD.
--
-- Shapes (dates are 'YYYY-MM-DD'; all figures integers):
--   analytics_daily_sales(p_from, p_to)
--     {from, to, days: [{date, gross, discounts, voids, voids_count, payments, refunds,
--                        net, cash, card, tabs, covers}] (every date in range),
--      totals: {same keys without date}}
--   analytics_hourly(p_from, p_to)
--     {from, to, hours: [{hour 0-23, gross, net, tabs}] (24 entries, local hour)}
--   analytics_best_sellers(p_from, p_to, p_limit default 10, 1..100 else INVALID_ARGUMENT)
--     {from, to, items: [{menu_item_id, name_en, name_ar, qty, revenue}]}
--     revenue = line totals (pre-discount); ordered by qty desc, revenue desc.
--   analytics_by_waiter(p_from, p_to)
--     {from, to, waiters: [{staff_id, full_name, tabs, covers, revenue, avg_ticket}]}
--     revenue = net of the waiter's tabs (payments - refunds in range), tabs /
--     covers = their tabs opened in range, avg_ticket = round(revenue / tabs), 0
--     with no tabs. Sum of revenue = the daily net total. Ordered by revenue desc.
--   analytics_payment_mix(p_from, p_to)
--     {from, to, methods: [{method, count, payments, refunds, net}] (cash, card), net}
--   panel_headline(p_from, p_to)
--     {from, to, prev_from, prev_to, revenue, covers, tabs, avg_ticket, discounts,
--      voids, refunds}, each figure {current, previous}; the previous period is the
--      same number of days immediately before. revenue = net; avg_ticket =
--      round(net / tabs), 0 with no tabs.
--   report_item_margins(p_from, p_to)
--     {from, to, items: [{menu_item_id, name_en, name_ar, qty, revenue, cost, margin,
--                         costed}], totals: {revenue, cost, margin}}
--     cost = the `sale` movements of those lines at their own unit_cost, so it is
--     the cost at the time of sale; costed = the lines moved any stock (an item
--     without a recipe shows cost 0, costed false). Ordered by margin desc.

-- ---------------------------------------------------------------------------
-- Internal helpers (no client grant).
-- ---------------------------------------------------------------------------
create or replace function app.venue_timezone() returns text
language sql stable security definer set search_path = public as $venue_timezone$
  select coalesce((select v.timezone from venues v where v.id = app.current_venue()), 'Asia/Baghdad')
$venue_timezone$;

create or replace function app.analytics_guard(p_from date, p_to date) returns void
language plpgsql stable security definer set search_path = public as $analytics_guard$
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;
end $analytics_guard$;

-- Tabs that count: this venue's, not void, not merged away.
create or replace function app.analytics_live_tabs() returns setof tabs
language sql stable security definer set search_path = public as $analytics_live_tabs$
  select * from tabs t
   where t.venue_id = app.current_venue() and t.status <> 'void' and t.merged_into_tab_id is null
$analytics_live_tabs$;

-- One row per business date in [p_from, p_to] with every money figure. The
-- daily report and the panel both read this, so they always agree.
create or replace function app.sales_by_day(p_from date, p_to date)
returns table (
  day date, gross bigint, discounts bigint, voids bigint, voids_count bigint,
  payments bigint, refunds bigint, net bigint, cash bigint, card bigint, tabs bigint, covers bigint
)
language plpgsql stable security definer set search_path = public as $sales_by_day$
declare
  v_tz    text := app.venue_timezone();
  v_start timestamptz := p_from::timestamp at time zone v_tz;
  v_end   timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  return query
  with live as (select * from app.analytics_live_tabs()),
  l as (
    select (oi.created_at at time zone v_tz)::date as d, sum(oi.line_total) as gross
      from order_items oi join live t on t.id = oi.tab_id
     where oi.voided_at is null and oi.created_at >= v_start and oi.created_at < v_end
     group by 1),
  v as (
    select (oi.voided_at at time zone v_tz)::date as d, sum(oi.line_total) as amt, count(*) as n
      from order_items oi join live t on t.id = oi.tab_id
     where oi.voided_at >= v_start and oi.voided_at < v_end
     group by 1),
  a as (
    select (x.created_at at time zone v_tz)::date as d, sum(x.amount) as amt
      from tab_adjustments x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end
     group by 1),
  p as (
    select (x.created_at at time zone v_tz)::date as d, sum(x.amount) as amt,
           sum(x.amount) filter (where x.method = 'cash') as cash,
           sum(x.amount) filter (where x.method = 'card') as card
      from payments x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end
     group by 1),
  r as (
    select (x.created_at at time zone v_tz)::date as d, sum(x.amount) as amt,
           sum(x.amount) filter (where x.method = 'cash') as cash,
           sum(x.amount) filter (where x.method = 'card') as card
      from refunds x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end
     group by 1),
  tb as (
    select (t.opened_at at time zone v_tz)::date as d, count(*) as n, sum(t.covers) as covers
      from live t
     where t.opened_at >= v_start and t.opened_at < v_end
     group by 1)
  select ds.d::date,
         coalesce(l.gross, 0)::bigint,
         coalesce(a.amt, 0)::bigint,
         coalesce(v.amt, 0)::bigint,
         coalesce(v.n, 0)::bigint,
         coalesce(p.amt, 0)::bigint,
         coalesce(r.amt, 0)::bigint,
         (coalesce(p.amt, 0) - coalesce(r.amt, 0))::bigint,
         (coalesce(p.cash, 0) - coalesce(r.cash, 0))::bigint,
         (coalesce(p.card, 0) - coalesce(r.card, 0))::bigint,
         coalesce(tb.n, 0)::bigint,
         coalesce(tb.covers, 0)::bigint
    from generate_series(p_from, p_to, interval '1 day') as ds(d)
    left join l  on l.d  = ds.d::date
    left join v  on v.d  = ds.d::date
    left join a  on a.d  = ds.d::date
    left join p  on p.d  = ds.d::date
    left join r  on r.d  = ds.d::date
    left join tb on tb.d = ds.d::date
   order by 1;
end $sales_by_day$;

revoke all on function app.venue_timezone() from public, anon, authenticated;
revoke all on function app.analytics_guard(date, date) from public, anon, authenticated;
revoke all on function app.analytics_live_tabs() from public, anon, authenticated;
revoke all on function app.sales_by_day(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- analytics_daily_sales
-- ---------------------------------------------------------------------------
create or replace function app.analytics_daily_sales(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_daily_sales$
declare
  v_out jsonb;
begin
  perform app.analytics_guard(p_from, p_to);

  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'days', coalesce(jsonb_agg(jsonb_build_object(
                     'date', s.day, 'gross', s.gross, 'discounts', s.discounts, 'voids', s.voids,
                     'voids_count', s.voids_count, 'payments', s.payments, 'refunds', s.refunds,
                     'net', s.net, 'cash', s.cash, 'card', s.card, 'tabs', s.tabs, 'covers', s.covers)
                   order by s.day), '[]'),
           'totals', jsonb_build_object(
                     'gross', coalesce(sum(s.gross), 0), 'discounts', coalesce(sum(s.discounts), 0),
                     'voids', coalesce(sum(s.voids), 0), 'voids_count', coalesce(sum(s.voids_count), 0),
                     'payments', coalesce(sum(s.payments), 0), 'refunds', coalesce(sum(s.refunds), 0),
                     'net', coalesce(sum(s.net), 0), 'cash', coalesce(sum(s.cash), 0),
                     'card', coalesce(sum(s.card), 0), 'tabs', coalesce(sum(s.tabs), 0),
                     'covers', coalesce(sum(s.covers), 0)))
    into v_out
    from app.sales_by_day(p_from, p_to) s;
  return v_out;
end $analytics_daily_sales$;

-- ---------------------------------------------------------------------------
-- analytics_hourly
-- ---------------------------------------------------------------------------
create or replace function app.analytics_hourly(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_hourly$
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz    := app.venue_timezone();
  v_start := p_from::timestamp at time zone v_tz;
  v_end   := (p_to + 1)::timestamp at time zone v_tz;

  with live as (select * from app.analytics_live_tabs()),
  g as (
    select extract(hour from oi.created_at at time zone v_tz)::int as h, sum(oi.line_total) as amt
      from order_items oi join live t on t.id = oi.tab_id
     where oi.voided_at is null and oi.created_at >= v_start and oi.created_at < v_end
     group by 1),
  n as (
    select h, sum(amt) as amt from (
      select extract(hour from x.created_at at time zone v_tz)::int as h, x.amount as amt
        from payments x join live t on t.id = x.tab_id
       where x.created_at >= v_start and x.created_at < v_end
      union all
      select extract(hour from x.created_at at time zone v_tz)::int, -x.amount
        from refunds x join live t on t.id = x.tab_id
       where x.created_at >= v_start and x.created_at < v_end) u
     group by 1),
  tb as (
    select extract(hour from t.opened_at at time zone v_tz)::int as h, count(*) as n
      from live t
     where t.opened_at >= v_start and t.opened_at < v_end
     group by 1)
  select jsonb_build_object('from', p_from, 'to', p_to, 'hours',
           jsonb_agg(jsonb_build_object('hour', hs.h, 'gross', coalesce(g.amt, 0),
                                        'net', coalesce(n.amt, 0), 'tabs', coalesce(tb.n, 0))
                     order by hs.h))
    into v_out
    from generate_series(0, 23) as hs(h)
    left join g  on g.h  = hs.h
    left join n  on n.h  = hs.h
    left join tb on tb.h = hs.h;
  return v_out;
end $analytics_hourly$;

-- ---------------------------------------------------------------------------
-- analytics_best_sellers
-- ---------------------------------------------------------------------------
create or replace function app.analytics_best_sellers(p_from date, p_to date, p_limit int default 10)
returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_best_sellers$
declare
  v_tz  text;
  v_out jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;
  v_tz := app.venue_timezone();

  with s as (
    select oi.menu_item_id, sum(oi.qty) as qty, sum(oi.line_total) as revenue
      from order_items oi join app.analytics_live_tabs() t on t.id = oi.tab_id
     where oi.voided_at is null
       and oi.created_at >= p_from::timestamp at time zone v_tz
       and oi.created_at < (p_to + 1)::timestamp at time zone v_tz
     group by 1
     order by qty desc, revenue desc, oi.menu_item_id
     limit p_limit)
  select jsonb_build_object('from', p_from, 'to', p_to, 'items', coalesce(jsonb_agg(
           jsonb_build_object('menu_item_id', s.menu_item_id, 'name_en', m.name_en, 'name_ar', m.name_ar,
                              'qty', s.qty, 'revenue', s.revenue)
           order by s.qty desc, s.revenue desc, s.menu_item_id), '[]'))
    into v_out
    from s join menu_items m on m.id = s.menu_item_id;
  return v_out;
end $analytics_best_sellers$;

-- ---------------------------------------------------------------------------
-- analytics_by_waiter
-- ---------------------------------------------------------------------------
create or replace function app.analytics_by_waiter(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_by_waiter$
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz    := app.venue_timezone();
  v_start := p_from::timestamp at time zone v_tz;
  v_end   := (p_to + 1)::timestamp at time zone v_tz;

  with live as (select * from app.analytics_live_tabs()),
  money as (
    select t.waiter_id, sum(u.amt) as revenue from (
      select x.tab_id, x.amount as amt from payments x
       where x.created_at >= v_start and x.created_at < v_end
      union all
      select x.tab_id, -x.amount from refunds x
       where x.created_at >= v_start and x.created_at < v_end) u
    join live t on t.id = u.tab_id
    group by 1),
  tb as (
    select t.waiter_id, count(*) as tabs, sum(t.covers) as covers
      from live t
     where t.opened_at >= v_start and t.opened_at < v_end
     group by 1),
  w as (
    select coalesce(tb.waiter_id, money.waiter_id) as staff_id,
           coalesce(tb.tabs, 0) as tabs, coalesce(tb.covers, 0) as covers,
           coalesce(money.revenue, 0) as revenue
      from tb full join money on money.waiter_id = tb.waiter_id)
  select jsonb_build_object('from', p_from, 'to', p_to, 'waiters', coalesce(jsonb_agg(
           jsonb_build_object('staff_id', w.staff_id, 'full_name', st.full_name, 'tabs', w.tabs,
                              'covers', w.covers, 'revenue', w.revenue,
                              'avg_ticket', case when w.tabs > 0 then round(w.revenue::numeric / w.tabs)::bigint else 0 end)
           order by w.revenue desc, st.full_name, w.staff_id), '[]'))
    into v_out
    from w join staff st on st.id = w.staff_id;
  return v_out;
end $analytics_by_waiter$;

-- ---------------------------------------------------------------------------
-- analytics_payment_mix
-- ---------------------------------------------------------------------------
create or replace function app.analytics_payment_mix(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_payment_mix$
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz    := app.venue_timezone();
  v_start := p_from::timestamp at time zone v_tz;
  v_end   := (p_to + 1)::timestamp at time zone v_tz;

  with live as (select * from app.analytics_live_tabs()),
  p as (
    select x.method, count(*) as n, sum(x.amount) as amt
      from payments x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end
     group by 1),
  r as (
    select x.method, sum(x.amount) as amt
      from refunds x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end
     group by 1),
  m as (
    select pm.method, coalesce(p.n, 0) as n, coalesce(p.amt, 0) as pay, coalesce(r.amt, 0) as ref
      from unnest(enum_range(null::payment_method)) as pm(method)
      left join p on p.method = pm.method
      left join r on r.method = pm.method)
  select jsonb_build_object('from', p_from, 'to', p_to,
           'methods', jsonb_agg(jsonb_build_object('method', m.method, 'count', m.n, 'payments', m.pay,
                                                   'refunds', m.ref, 'net', m.pay - m.ref)
                                order by m.method),
           'net', sum(m.pay - m.ref))
    into v_out
    from m;
  return v_out;
end $analytics_payment_mix$;

-- ---------------------------------------------------------------------------
-- panel_headline
-- ---------------------------------------------------------------------------
create or replace function app.panel_headline(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $panel_headline$
declare
  v_len       int;
  v_prev_from date;
  v_prev_to   date;
  c           record;
  p           record;
begin
  perform app.analytics_guard(p_from, p_to);
  v_len       := p_to - p_from + 1;
  v_prev_to   := p_from - 1;
  v_prev_from := p_from - v_len;

  select coalesce(sum(net), 0) as revenue, coalesce(sum(covers), 0) as covers, coalesce(sum(tabs), 0) as tabs,
         coalesce(sum(discounts), 0) as discounts, coalesce(sum(voids), 0) as voids,
         coalesce(sum(refunds), 0) as refunds
    into c from app.sales_by_day(p_from, p_to);
  select coalesce(sum(net), 0) as revenue, coalesce(sum(covers), 0) as covers, coalesce(sum(tabs), 0) as tabs,
         coalesce(sum(discounts), 0) as discounts, coalesce(sum(voids), 0) as voids,
         coalesce(sum(refunds), 0) as refunds
    into p from app.sales_by_day(v_prev_from, v_prev_to);

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to,
    'revenue',    jsonb_build_object('current', c.revenue,   'previous', p.revenue),
    'covers',     jsonb_build_object('current', c.covers,    'previous', p.covers),
    'tabs',       jsonb_build_object('current', c.tabs,      'previous', p.tabs),
    'avg_ticket', jsonb_build_object(
                    'current',  case when c.tabs > 0 then round(c.revenue::numeric / c.tabs)::bigint else 0 end,
                    'previous', case when p.tabs > 0 then round(p.revenue::numeric / p.tabs)::bigint else 0 end),
    'discounts',  jsonb_build_object('current', c.discounts, 'previous', p.discounts),
    'voids',      jsonb_build_object('current', c.voids,     'previous', p.voids),
    'refunds',    jsonb_build_object('current', c.refunds,   'previous', p.refunds));
end $panel_headline$;

-- ---------------------------------------------------------------------------
-- report_item_margins
-- ---------------------------------------------------------------------------
create or replace function app.report_item_margins(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $report_item_margins$
declare
  v_tz  text;
  v_out jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz := app.venue_timezone();

  with lines as (
    select oi.id, oi.menu_item_id, oi.qty, oi.line_total
      from order_items oi join app.analytics_live_tabs() t on t.id = oi.tab_id
     where oi.voided_at is null
       and oi.created_at >= p_from::timestamp at time zone v_tz
       and oi.created_at < (p_to + 1)::timestamp at time zone v_tz),
  costs as (
    select m.ref_id as line_id, sum(-m.qty * coalesce(m.unit_cost, 0)) as cost
      from stock_movements m
     where m.ref_table = 'order_items' and m.kind = 'sale' and m.ref_id in (select id from lines)
     group by 1),
  s as (
    select l.menu_item_id, sum(l.qty) as qty, sum(l.line_total) as revenue,
           round(coalesce(sum(c.cost), 0))::bigint as cost, bool_or(c.line_id is not null) as costed
      from lines l left join costs c on c.line_id = l.id
     group by 1)
  select jsonb_build_object('from', p_from, 'to', p_to,
           'items', coalesce(jsonb_agg(jsonb_build_object(
                      'menu_item_id', s.menu_item_id, 'name_en', mi.name_en, 'name_ar', mi.name_ar,
                      'qty', s.qty, 'revenue', s.revenue, 'cost', s.cost, 'margin', s.revenue - s.cost,
                      'costed', s.costed)
                    order by s.revenue - s.cost desc, s.menu_item_id), '[]'),
           'totals', jsonb_build_object('revenue', coalesce(sum(s.revenue), 0), 'cost', coalesce(sum(s.cost), 0),
                                        'margin', coalesce(sum(s.revenue - s.cost), 0)))
    into v_out
    from s join menu_items mi on mi.id = s.menu_item_id;
  return v_out;
end $report_item_margins$;

revoke all on function app.analytics_daily_sales(date, date) from public, anon, authenticated;
revoke all on function app.analytics_hourly(date, date) from public, anon, authenticated;
revoke all on function app.analytics_best_sellers(date, date, int) from public, anon, authenticated;
revoke all on function app.analytics_by_waiter(date, date) from public, anon, authenticated;
revoke all on function app.analytics_payment_mix(date, date) from public, anon, authenticated;
revoke all on function app.panel_headline(date, date) from public, anon, authenticated;
revoke all on function app.report_item_margins(date, date) from public, anon, authenticated;
grant execute on function app.analytics_daily_sales(date, date) to authenticated;
grant execute on function app.analytics_hourly(date, date) to authenticated;
grant execute on function app.analytics_best_sellers(date, date, int) to authenticated;
grant execute on function app.analytics_by_waiter(date, date) to authenticated;
grant execute on function app.analytics_payment_mix(date, date) to authenticated;
grant execute on function app.panel_headline(date, date) to authenticated;
grant execute on function app.report_item_margins(date, date) to authenticated;
