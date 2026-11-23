-- 0131 analytics v2: the reports an owner acts on. Manager and owner only.
--
-- Same posture as 0044: stable security definer, jsonb out, app.analytics_guard
-- first, every query filtered to the current venue, events dated by their own
-- timestamp as a calendar date in the venue time zone, void and merged-away tabs
-- excluded (app.analytics_live_tabs). All money is integer IQD.
--
--   analytics_overview(p_from, p_to)
--     {from, to, prev_from, prev_to, weeks_back, net, covers, tabs, spend_per_cover,
--      item_sales, cogs, food_cost_bps, discounts, voids, refunds}, each figure
--      {current, previous}. The previous period is the same range moved back by whole
--      weeks (ceil(days / 7)), so every day is compared with the same weekday.
--      spend_per_cover = round(net / covers), 0 with no covers. cogs = cost of the
--      stock the sold lines moved, at the cost when sold. food_cost_bps = cogs over
--      the sales of the lines that moved stock (null when none did), so items
--      without a recipe do not flatter the figure.
--   analytics_menu_engineering(p_from, p_to)
--     {from, to, categories: [{category_id, name_en, name_ar, items, qty, revenue,
--        margin, avg_unit_margin, popular_from}],
--      items: [{menu_item_id, name_en, name_ar, category_id, is_active, qty, revenue,
--        cost, margin, unit_margin, share_bps, class}],
--      counts: {star, plowhorse, puzzle, dog, uncosted}}
--     Every active item, plus inactive ones that sold. Within its category an item
--     is popular when qty >= 70% of an even share (0.7 x category qty / items), and
--     high-margin when its unit margin >= the category's average unit margin
--     (weighted by qty, costed items only). class: star (popular, high margin),
--     plowhorse (popular, low), puzzle (unpopular, high), dog (neither), uncosted
--     (no recipe moved stock and it has no recipe now). An unsold item uses its
--     current price minus current recipe cost as unit margin.
--   analytics_stock_losses(p_from, p_to)
--     {from, to, items: [{ingredient_id, name_en, name_ar, unit, waste_qty,
--        waste_value, missing_qty, missing_value, loss_value, usage_value, loss_bps}],
--      totals: {waste_value, missing_value, loss_value, usage_value, loss_bps}}
--     waste = `waste` movements. missing = what stock counts wrote off: the negated
--     `count_adjust` movements, so a surplus is negative. usage = sales by recipe,
--     net of void returns. loss = waste + missing; loss_bps = loss over usage (null
--     with no usage). Only ingredients with waste or a count difference; ordered by
--     loss_value desc.
--   analytics_staff(p_from, p_to)
--     {from, to, venue_exception_bps, staff: [{staff_id, full_name, role, tabs, covers,
--        revenue, items, spend_per_cover, items_per_cover_x100, payments_taken,
--        voids_count, voids_value, discounts_count, discounts_value, refunds_count,
--        refunds_value, exception_count, exception_value, exception_bps, drawer_opens,
--        paid_outs_count, paid_outs_value, shifts, cash_variance, variance_alerts,
--        flagged}]}
--     Waiter figures as analytics_by_waiter. Voids are credited to who voided,
--     discounts to who applied, refunds to who refunded. exception = voids +
--     discounts + refunds; exception_bps = exception_value over the larger of the
--     person's revenue and payments taken (null with neither). flagged = at least 3
--     exceptions and a rate at least twice the venue's. A flag is a reason to open
--     the transactions, not proof of anything.
--   analytics_weekday_hour(p_from, p_to)
--     {from, to, days: [n per weekday 0 (Sunday) .. 6], cells: [{dow, hour, net, tabs}]}
--     Only cells with activity. days lets the client show an average per weekday.
--   analytics_price_changes(p_from, p_to)
--     {from, to, items: [{ingredient_id, name_en, name_ar, unit, old_cost, new_cost,
--        change_bps, received_at, menu_items: [{name_en, name_ar}]}]}
--     Per ingredient, its latest delivery in the range whose unit cost differs from
--     the delivery before it. Ordered by change_bps desc (rises first).
--   analytics_table_turns(p_from, p_to)
--     {from, to, areas: [{area_id, name_en, name_ar, tables, tabs, avg_minutes}],
--      tabs, avg_minutes}: settled tabs on a table, opened in the range.
--   analytics_attention()
--     {as_of, items: [{kind, count, value?, ...}]}: what needs the owner now. Kinds:
--       day_left_open {business_date}; shifts_left_open; cash_variance {value, worst:
--       {staff_name, variance, closed_at}} (alerts in the last 7 days); staff_flags
--       (last 7 days); low_stock; negative_stock; uncosted_items; price_rises (cost up
--       10% or more on a delivery in the last 14 days). Only kinds with something to
--       report.

-- ---------------------------------------------------------------------------
-- Internal: sales and cost of the non-voided lines sent in a window.
-- ---------------------------------------------------------------------------
create or replace function app.analytics_cogs(p_start timestamptz, p_end timestamptz)
returns table (item_sales bigint, costed_sales bigint, cogs bigint)
language sql stable security definer set search_path = public as $analytics_cogs$
  with lines as (
    select oi.id, oi.line_total
      from order_items oi join app.analytics_live_tabs() t on t.id = oi.tab_id
     where oi.voided_at is null and oi.created_at >= p_start and oi.created_at < p_end),
  costs as (
    select m.ref_id as line_id, sum(-m.qty * coalesce(m.unit_cost, 0)) as cost
      from stock_movements m
     where m.ref_table = 'order_items' and m.kind = 'sale' and m.ref_id in (select id from lines)
     group by 1)
  select coalesce(sum(l.line_total), 0)::bigint,
         coalesce(sum(l.line_total) filter (where c.line_id is not null), 0)::bigint,
         round(coalesce(sum(c.cost), 0))::bigint
    from lines l left join costs c on c.line_id = l.id
$analytics_cogs$;

revoke all on function app.analytics_cogs(timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- analytics_overview
-- ---------------------------------------------------------------------------
create or replace function app.analytics_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_overview$
declare
  v_tz        text;
  v_weeks     int;
  v_prev_from date;
  v_prev_to   date;
  c           record;
  p           record;
  cc          record;
  pc          record;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz        := app.venue_timezone();
  v_weeks     := ceil((p_to - p_from + 1) / 7.0);
  v_prev_from := p_from - 7 * v_weeks;
  v_prev_to   := p_to - 7 * v_weeks;

  select coalesce(sum(net), 0) as net, coalesce(sum(covers), 0) as covers, coalesce(sum(tabs), 0) as tabs,
         coalesce(sum(discounts), 0) as discounts, coalesce(sum(voids), 0) as voids,
         coalesce(sum(refunds), 0) as refunds
    into c from app.sales_by_day(p_from, p_to);
  select coalesce(sum(net), 0) as net, coalesce(sum(covers), 0) as covers, coalesce(sum(tabs), 0) as tabs,
         coalesce(sum(discounts), 0) as discounts, coalesce(sum(voids), 0) as voids,
         coalesce(sum(refunds), 0) as refunds
    into p from app.sales_by_day(v_prev_from, v_prev_to);
  select * into cc from app.analytics_cogs(p_from::timestamp at time zone v_tz, (p_to + 1)::timestamp at time zone v_tz);
  select * into pc from app.analytics_cogs(v_prev_from::timestamp at time zone v_tz,
                                           (v_prev_to + 1)::timestamp at time zone v_tz);

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to, 'weeks_back', v_weeks,
    'net',        jsonb_build_object('current', c.net,       'previous', p.net),
    'covers',     jsonb_build_object('current', c.covers,    'previous', p.covers),
    'tabs',       jsonb_build_object('current', c.tabs,      'previous', p.tabs),
    'spend_per_cover', jsonb_build_object(
      'current',  case when c.covers > 0 then round(c.net::numeric / c.covers)::bigint else 0 end,
      'previous', case when p.covers > 0 then round(p.net::numeric / p.covers)::bigint else 0 end),
    'item_sales', jsonb_build_object('current', cc.item_sales, 'previous', pc.item_sales),
    'cogs',       jsonb_build_object('current', cc.cogs,       'previous', pc.cogs),
    'food_cost_bps', jsonb_build_object(
      'current',  case when cc.costed_sales > 0 then round(cc.cogs * 10000.0 / cc.costed_sales)::int end,
      'previous', case when pc.costed_sales > 0 then round(pc.cogs * 10000.0 / pc.costed_sales)::int end),
    'discounts',  jsonb_build_object('current', c.discounts, 'previous', p.discounts),
    'voids',      jsonb_build_object('current', c.voids,     'previous', p.voids),
    'refunds',    jsonb_build_object('current', c.refunds,   'previous', p.refunds));
end $analytics_overview$;

-- ---------------------------------------------------------------------------
-- analytics_menu_engineering
-- ---------------------------------------------------------------------------
create or replace function app.analytics_menu_engineering(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_menu_engineering$
declare
  v_venue uuid := app.current_venue();
  v_tz    text;
  v_out   jsonb;
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
  sold as (
    select l.menu_item_id, sum(l.qty)::bigint as qty, sum(l.line_total)::bigint as revenue,
           round(coalesce(sum(c.cost), 0))::bigint as cost, bool_or(c.line_id is not null) as costed
      from lines l left join costs c on c.line_id = l.id
     group by 1),
  recipe as (
    select mi.id, round(coalesce(sum(rl.qty * i.cost_per_unit), 0))::bigint as unit_cost, count(rl.id) > 0 as has_recipe
      from menu_items mi
      left join recipe_lines rl on rl.menu_item_id = mi.id
      left join ingredients i on i.id = rl.ingredient_id
     where mi.venue_id = v_venue
     group by mi.id),
  items as (
    select mi.id, mi.name_en, mi.name_ar, mi.category_id, mi.is_active,
           coalesce(s.qty, 0) as qty, coalesce(s.revenue, 0) as revenue, coalesce(s.cost, 0) as cost,
           (coalesce(s.costed, false) or r.has_recipe) as costed,
           case when coalesce(s.qty, 0) > 0 then round((s.revenue - s.cost)::numeric / s.qty)::bigint
                else mi.price::bigint - r.unit_cost end as unit_margin
      from menu_items mi
      join recipe r on r.id = mi.id
      left join sold s on s.menu_item_id = mi.id
     where mi.venue_id = v_venue and (mi.is_active or s.menu_item_id is not null)),
  cat as (
    select i.category_id, count(*) as n, sum(i.qty) as qty, sum(i.revenue) as revenue,
           coalesce(sum(i.revenue - i.cost) filter (where i.costed), 0) as margin,
           coalesce(sum(i.qty) filter (where i.costed), 0) as costed_qty
      from items i
     group by 1),
  cat2 as (
    select c.*,
           case when c.costed_qty > 0 then round(c.margin::numeric / c.costed_qty)::bigint else 0 end as avg_unit_margin,
           0.7 * c.qty / c.n as popular_from
      from cat c),
  classed as (
    select i.*,
           case when c.qty > 0 then round(i.qty * 10000.0 / c.qty)::int else 0 end as share_bps,
           case when not i.costed then 'uncosted'
                when c.qty > 0 and i.qty >= c.popular_from and i.unit_margin >= c.avg_unit_margin then 'star'
                when c.qty > 0 and i.qty >= c.popular_from then 'plowhorse'
                when i.unit_margin >= c.avg_unit_margin then 'puzzle'
                else 'dog' end as class
      from items i join cat2 c on c.category_id = i.category_id)
  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'categories', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'category_id', c.category_id, 'name_en', mc.name_en, 'name_ar', mc.name_ar,
                      'items', c.n, 'qty', c.qty, 'revenue', c.revenue, 'margin', c.margin,
                      'avg_unit_margin', c.avg_unit_margin, 'popular_from', round(c.popular_from, 1))
                    order by c.revenue desc, mc.sort, c.category_id)
               from cat2 c join menu_categories mc on mc.id = c.category_id), '[]'::jsonb),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'menu_item_id', x.id, 'name_en', x.name_en, 'name_ar', x.name_ar,
                      'category_id', x.category_id, 'is_active', x.is_active, 'qty', x.qty,
                      'revenue', x.revenue, 'cost', x.cost, 'margin', x.revenue - x.cost,
                      'unit_margin', x.unit_margin, 'share_bps', x.share_bps, 'class', x.class)
                    order by x.revenue - x.cost desc, x.name_en, x.id)
               from classed x), '[]'::jsonb),
           'counts', (
             select jsonb_build_object(
                      'star', count(*) filter (where x.class = 'star'),
                      'plowhorse', count(*) filter (where x.class = 'plowhorse'),
                      'puzzle', count(*) filter (where x.class = 'puzzle'),
                      'dog', count(*) filter (where x.class = 'dog'),
                      'uncosted', count(*) filter (where x.class = 'uncosted'))
               from classed x))
    into v_out;
  return v_out;
end $analytics_menu_engineering$;

-- ---------------------------------------------------------------------------
-- analytics_stock_losses
-- ---------------------------------------------------------------------------
create or replace function app.analytics_stock_losses(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_stock_losses$
declare
  v_venue uuid := app.current_venue();
  v_tz    text;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz := app.venue_timezone();

  with m as (
    select sm.ingredient_id, sm.kind, sm.qty, coalesce(sm.unit_cost, i.cost_per_unit) as cost
      from stock_movements sm join ingredients i on i.id = sm.ingredient_id
     where sm.venue_id = v_venue
       and sm.created_at >= p_from::timestamp at time zone v_tz
       and sm.created_at < (p_to + 1)::timestamp at time zone v_tz),
  agg as (
    select m.ingredient_id,
           coalesce(-sum(m.qty) filter (where m.kind = 'waste'), 0) as waste_qty,
           round(coalesce(-sum(m.qty * m.cost) filter (where m.kind = 'waste'), 0))::bigint as waste_value,
           coalesce(-sum(m.qty) filter (where m.kind = 'count_adjust'), 0) as missing_qty,
           round(coalesce(-sum(m.qty * m.cost) filter (where m.kind = 'count_adjust'), 0))::bigint as missing_value,
           round(coalesce(-sum(m.qty * m.cost) filter (where m.kind in ('sale', 'void_return')), 0))::bigint as usage_value
      from m
     group by 1),
  rows as (
    select a.*, a.waste_value + a.missing_value as loss_value
      from agg a
     where a.waste_qty <> 0 or a.missing_qty <> 0),
  tot as (
    select coalesce(sum(a.waste_value), 0) as waste_value, coalesce(sum(a.missing_value), 0) as missing_value,
           coalesce(sum(a.usage_value), 0) as usage_value
      from agg a)
  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'ingredient_id', r.ingredient_id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'unit', i.unit,
                      'waste_qty', r.waste_qty, 'waste_value', r.waste_value,
                      'missing_qty', r.missing_qty, 'missing_value', r.missing_value,
                      'loss_value', r.loss_value, 'usage_value', r.usage_value,
                      'loss_bps', case when r.usage_value > 0 then round(r.loss_value * 10000.0 / r.usage_value)::int end)
                    order by r.loss_value desc, i.name_en, r.ingredient_id)
               from rows r join ingredients i on i.id = r.ingredient_id), '[]'::jsonb),
           'totals', jsonb_build_object(
             'waste_value', tot.waste_value, 'missing_value', tot.missing_value,
             'loss_value', tot.waste_value + tot.missing_value, 'usage_value', tot.usage_value,
             'loss_bps', case when tot.usage_value > 0
                              then round((tot.waste_value + tot.missing_value) * 10000.0 / tot.usage_value)::int end))
    into v_out
    from tot;
  return v_out;
end $analytics_stock_losses$;

-- ---------------------------------------------------------------------------
-- analytics_staff
-- ---------------------------------------------------------------------------
create or replace function app.analytics_staff(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_staff$
declare
  v_venue     uuid := app.current_venue();
  v_tz        text;
  v_start     timestamptz;
  v_end       timestamptz;
  v_threshold bigint;
  v_out       jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz        := app.venue_timezone();
  v_start     := p_from::timestamp at time zone v_tz;
  v_end       := (p_to + 1)::timestamp at time zone v_tz;
  v_threshold := app.variance_alert_threshold(v_venue);

  with live as (select * from app.analytics_live_tabs()),
  wt as (
    select t.waiter_id as sid, count(*) as tabs, sum(t.covers) as covers
      from live t where t.opened_at >= v_start and t.opened_at < v_end group by 1),
  wrev as (
    select t.waiter_id as sid, sum(u.amt) as revenue from (
      select x.tab_id, x.amount as amt from payments x where x.created_at >= v_start and x.created_at < v_end
      union all
      select x.tab_id, -x.amount from refunds x where x.created_at >= v_start and x.created_at < v_end) u
    join live t on t.id = u.tab_id group by 1),
  witems as (
    select t.waiter_id as sid, sum(oi.qty) as items
      from order_items oi join live t on t.id = oi.tab_id
     where oi.voided_at is null and oi.created_at >= v_start and oi.created_at < v_end group by 1),
  taken as (
    select x.taken_by as sid, sum(x.amount) as amt
      from payments x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end group by 1),
  vd as (
    select oi.voided_by as sid, count(*) as n, sum(oi.line_total) as amt
      from order_items oi join live t on t.id = oi.tab_id
     where oi.voided_at >= v_start and oi.voided_at < v_end group by 1),
  dc as (
    select x.applied_by as sid, count(*) as n, sum(x.amount) as amt
      from tab_adjustments x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end group by 1),
  rf as (
    select x.refunded_by as sid, count(*) as n, sum(x.amount) as amt
      from refunds x join live t on t.id = x.tab_id
     where x.created_at >= v_start and x.created_at < v_end group by 1),
  dr as (
    select e.staff_id as sid, count(*) as n
      from drawer_events e
     where e.venue_id = v_venue and e.created_at >= v_start and e.created_at < v_end group by 1),
  po as (
    select m.staff_id as sid, count(*) as n, sum(m.amount) as amt
      from cash_movements m
     where m.venue_id = v_venue and m.kind = 'paid_out' and m.created_at >= v_start and m.created_at < v_end group by 1),
  sh as (
    select s.staff_id as sid, count(*) as n, sum(s.variance) as variance,
           count(*) filter (where abs(s.variance) >= v_threshold) as alerts
      from till_shifts s
     where s.venue_id = v_venue and s.closed_at >= v_start and s.closed_at < v_end group by 1),
  ids as (
    select sid from wt union select sid from wrev union select sid from witems union select sid from taken
    union select sid from vd union select sid from dc union select sid from rf union select sid from dr
    union select sid from po union select sid from sh),
  base as (
    select st.id, st.full_name, st.role,
           coalesce(wt.tabs, 0) as tabs, coalesce(wt.covers, 0) as covers,
           coalesce(wrev.revenue, 0) as revenue, coalesce(witems.items, 0) as items,
           coalesce(taken.amt, 0) as payments_taken,
           coalesce(vd.n, 0) as voids_count, coalesce(vd.amt, 0) as voids_value,
           coalesce(dc.n, 0) as discounts_count, coalesce(dc.amt, 0) as discounts_value,
           coalesce(rf.n, 0) as refunds_count, coalesce(rf.amt, 0) as refunds_value,
           coalesce(dr.n, 0) as drawer_opens,
           coalesce(po.n, 0) as paid_outs_count, coalesce(po.amt, 0) as paid_outs_value,
           coalesce(sh.n, 0) as shifts, coalesce(sh.variance, 0) as cash_variance, coalesce(sh.alerts, 0) as variance_alerts
      from ids
      join staff st on st.id = ids.sid and st.venue_id = v_venue
      left join wt on wt.sid = st.id left join wrev on wrev.sid = st.id left join witems on witems.sid = st.id
      left join taken on taken.sid = st.id left join vd on vd.sid = st.id left join dc on dc.sid = st.id
      left join rf on rf.sid = st.id left join dr on dr.sid = st.id left join po on po.sid = st.id
      left join sh on sh.sid = st.id),
  ex as (
    select b.*,
           b.voids_count + b.discounts_count + b.refunds_count as exception_count,
           b.voids_value + b.discounts_value + b.refunds_value as exception_value,
           greatest(b.revenue, b.payments_taken) as handled
      from base b),
  venue as (
    select case when coalesce(sum(e.revenue), 0) > 0
                then round(sum(e.exception_value) * 10000.0 / sum(e.revenue))::int else 0 end as bps
      from ex e),
  rated as (
    select e.*, case when e.handled > 0 then round(e.exception_value * 10000.0 / e.handled)::int end as exception_bps
      from ex e)
  select jsonb_build_object(
           'from', p_from, 'to', p_to, 'venue_exception_bps', venue.bps,
           'staff', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'staff_id', r.id, 'full_name', r.full_name, 'role', r.role,
                      'tabs', r.tabs, 'covers', r.covers, 'revenue', r.revenue, 'items', r.items,
                      'spend_per_cover', case when r.covers > 0 then round(r.revenue::numeric / r.covers)::bigint else 0 end,
                      'items_per_cover_x100', case when r.covers > 0 then round(r.items * 100.0 / r.covers)::int else 0 end,
                      'payments_taken', r.payments_taken,
                      'voids_count', r.voids_count, 'voids_value', r.voids_value,
                      'discounts_count', r.discounts_count, 'discounts_value', r.discounts_value,
                      'refunds_count', r.refunds_count, 'refunds_value', r.refunds_value,
                      'exception_count', r.exception_count, 'exception_value', r.exception_value,
                      'exception_bps', r.exception_bps,
                      'drawer_opens', r.drawer_opens,
                      'paid_outs_count', r.paid_outs_count, 'paid_outs_value', r.paid_outs_value,
                      'shifts', r.shifts, 'cash_variance', r.cash_variance, 'variance_alerts', r.variance_alerts,
                      'flagged', (r.exception_count >= 3 and venue.bps > 0
                                  and coalesce(r.exception_bps, 0) >= 2 * venue.bps))
                    order by r.exception_value desc, r.revenue desc, r.full_name, r.id)
               from rated r), '[]'::jsonb))
    into v_out
    from venue;
  return v_out;
end $analytics_staff$;

-- ---------------------------------------------------------------------------
-- analytics_weekday_hour
-- ---------------------------------------------------------------------------
create or replace function app.analytics_weekday_hour(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_weekday_hour$
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
    select extract(dow from u.at at time zone v_tz)::int as dow, extract(hour from u.at at time zone v_tz)::int as hour,
           sum(u.amt) as net
      from (
        select x.tab_id, x.created_at as at, x.amount as amt from payments x
         where x.created_at >= v_start and x.created_at < v_end
        union all
        select x.tab_id, x.created_at, -x.amount from refunds x
         where x.created_at >= v_start and x.created_at < v_end) u
      join live t on t.id = u.tab_id
     group by 1, 2),
  opened as (
    select extract(dow from t.opened_at at time zone v_tz)::int as dow,
           extract(hour from t.opened_at at time zone v_tz)::int as hour, count(*) as tabs
      from live t
     where t.opened_at >= v_start and t.opened_at < v_end
     group by 1, 2),
  cells as (
    select coalesce(m.dow, o.dow) as dow, coalesce(m.hour, o.hour) as hour,
           coalesce(m.net, 0) as net, coalesce(o.tabs, 0) as tabs
      from money m full join opened o on o.dow = m.dow and o.hour = m.hour),
  days as (
    select w.dow, count(g.d) as n
      from generate_series(0, 6) as w(dow)
      left join generate_series(p_from, p_to, interval '1 day') as g(d) on extract(dow from g.d::date)::int = w.dow
     group by w.dow)
  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'days', (select jsonb_agg(d.n order by d.dow) from days d),
           'cells', coalesce((
             select jsonb_agg(jsonb_build_object('dow', c.dow, 'hour', c.hour, 'net', c.net, 'tabs', c.tabs)
                              order by c.dow, c.hour)
               from cells c), '[]'::jsonb))
    into v_out;
  return v_out;
end $analytics_weekday_hour$;

-- ---------------------------------------------------------------------------
-- analytics_price_changes
-- ---------------------------------------------------------------------------
create or replace function app.analytics_price_changes(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_price_changes$
declare
  v_venue uuid := app.current_venue();
  v_tz    text;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz := app.venue_timezone();

  with hist as (
    select l.ingredient_id, l.unit_cost, d.received_at,
           lag(l.unit_cost) over (partition by l.ingredient_id order by d.received_at, l.created_at, l.id) as prev_cost
      from delivery_lines l join deliveries d on d.id = l.delivery_id
     where l.venue_id = v_venue),
  changed as (
    select distinct on (h.ingredient_id) h.ingredient_id, h.unit_cost, h.prev_cost, h.received_at
      from hist h
     where h.received_at >= p_from::timestamp at time zone v_tz
       and h.received_at < (p_to + 1)::timestamp at time zone v_tz
       and h.prev_cost is not null and h.prev_cost > 0 and h.unit_cost <> h.prev_cost
     order by h.ingredient_id, h.received_at desc)
  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'items', coalesce(jsonb_agg(jsonb_build_object(
                      'ingredient_id', c.ingredient_id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'unit', i.unit,
                      'old_cost', c.prev_cost, 'new_cost', c.unit_cost,
                      'change_bps', round((c.unit_cost - c.prev_cost) * 10000.0 / c.prev_cost)::int,
                      'received_at', c.received_at,
                      'menu_items', coalesce((
                        select jsonb_agg(jsonb_build_object('name_en', mi.name_en, 'name_ar', mi.name_ar) order by mi.name_en)
                          from recipe_lines rl join menu_items mi on mi.id = rl.menu_item_id
                         where rl.ingredient_id = c.ingredient_id and mi.is_active), '[]'::jsonb))
                    order by (c.unit_cost - c.prev_cost) / c.prev_cost desc, i.name_en, c.ingredient_id), '[]'::jsonb))
    into v_out
    from changed c join ingredients i on i.id = c.ingredient_id;
  return v_out;
end $analytics_price_changes$;

-- ---------------------------------------------------------------------------
-- analytics_table_turns
-- ---------------------------------------------------------------------------
create or replace function app.analytics_table_turns(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_table_turns$
declare
  v_venue uuid := app.current_venue();
  v_tz    text;
  v_out   jsonb;
begin
  perform app.analytics_guard(p_from, p_to);
  v_tz := app.venue_timezone();

  with seated as (
    select dt.area_id, extract(epoch from (t.closed_at - t.opened_at)) / 60.0 as minutes
      from app.analytics_live_tabs() t join dining_tables dt on dt.id = t.table_id
     where t.status = 'settled' and t.closed_at is not null
       and t.opened_at >= p_from::timestamp at time zone v_tz
       and t.opened_at < (p_to + 1)::timestamp at time zone v_tz),
  per as (
    select fa.id, fa.name_en, fa.name_ar, fa.sort,
           (select count(*) from dining_tables dt where dt.area_id = fa.id and dt.is_active) as tables,
           count(s.minutes) as tabs, coalesce(round(avg(s.minutes))::int, 0) as avg_minutes
      from floor_areas fa left join seated s on s.area_id = fa.id
     where fa.venue_id = v_venue
     group by fa.id)
  select jsonb_build_object(
           'from', p_from, 'to', p_to,
           'areas', coalesce((
             select jsonb_agg(jsonb_build_object('area_id', p.id, 'name_en', p.name_en, 'name_ar', p.name_ar,
                                                 'tables', p.tables, 'tabs', p.tabs, 'avg_minutes', p.avg_minutes)
                              order by p.sort, p.name_en, p.id)
               from per p), '[]'::jsonb),
           'tabs', (select count(*) from seated),
           'avg_minutes', coalesce((select round(avg(s.minutes))::int from seated s), 0))
    into v_out;
  return v_out;
end $analytics_table_turns$;

-- ---------------------------------------------------------------------------
-- analytics_attention
-- ---------------------------------------------------------------------------
create or replace function app.analytics_attention() returns jsonb
language plpgsql stable security definer set search_path = public as $analytics_attention$
declare
  v_venue     uuid := app.current_venue();
  v_today     date := app.business_date();
  v_tz        text;
  v_week      timestamptz;
  v_threshold bigint;
  v_items     jsonb := '[]'::jsonb;
  r           record;
  n           bigint;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_tz        := app.venue_timezone();
  v_week      := (v_today - 6)::timestamp at time zone v_tz;
  v_threshold := app.variance_alert_threshold(v_venue);

  -- A business day from an earlier date is still open.
  select d.business_date into r from day_sessions d
   where d.venue_id = v_venue and d.closed_at is null and d.business_date < v_today
   order by d.business_date limit 1;
  if found then
    v_items := v_items || jsonb_build_object('kind', 'day_left_open', 'count', 1, 'business_date', r.business_date);
  end if;

  -- Till shifts open for more than a day.
  select count(*) into n from till_shifts s
   where s.venue_id = v_venue and s.closed_at is null and s.opened_at < now() - interval '24 hours';
  if n > 0 then
    v_items := v_items || jsonb_build_object('kind', 'shifts_left_open', 'count', n);
  end if;

  -- Cash counts that were off by the alert amount or more, last 7 days.
  select count(*) as n, coalesce(sum(abs(s.variance)), 0) as value into r from till_shifts s
   where s.venue_id = v_venue and s.closed_at >= v_week and abs(s.variance) >= v_threshold;
  if r.n > 0 then
    v_items := v_items || jsonb_build_object(
      'kind', 'cash_variance', 'count', r.n, 'value', r.value,
      'worst', (select jsonb_build_object('staff_name', st.full_name, 'variance', s.variance, 'closed_at', s.closed_at)
                  from till_shifts s join staff st on st.id = s.staff_id
                 where s.venue_id = v_venue and s.closed_at >= v_week and abs(s.variance) >= v_threshold
                 order by abs(s.variance) desc, s.closed_at desc limit 1));
  end if;

  -- Staff whose voids, discounts and refunds stand out, last 7 days.
  select count(*) into n
    from jsonb_array_elements(app.analytics_staff(v_today - 6, v_today) -> 'staff') e
   where (e ->> 'flagged')::boolean;
  if n > 0 then
    v_items := v_items || jsonb_build_object('kind', 'staff_flags', 'count', n);
  end if;

  -- Stock at or below its reorder point, and stock the ledger says is negative.
  select count(*) filter (where x.on_hand <= x.reorder_point and x.on_hand >= 0) as low,
         count(*) filter (where x.on_hand < 0) as negative
    into r
    from (select i.reorder_point, coalesce((select sum(m.qty) from stock_movements m where m.ingredient_id = i.id), 0) as on_hand
            from ingredients i where i.venue_id = v_venue and i.is_active) x;
  if r.low > 0 then
    v_items := v_items || jsonb_build_object('kind', 'low_stock', 'count', r.low);
  end if;
  if r.negative > 0 then
    v_items := v_items || jsonb_build_object('kind', 'negative_stock', 'count', r.negative);
  end if;

  -- Menu items on sale with no recipe: their cost and margin are unknown.
  select count(*) into n from menu_items mi
   where mi.venue_id = v_venue and mi.is_active
     and not exists (select 1 from recipe_lines rl where rl.menu_item_id = mi.id);
  if n > 0 then
    v_items := v_items || jsonb_build_object('kind', 'uncosted_items', 'count', n);
  end if;

  -- Ingredients whose cost rose 10% or more on a delivery in the last 14 days.
  select count(*) into n
    from jsonb_array_elements(app.analytics_price_changes(v_today - 13, v_today) -> 'items') e
   where (e ->> 'change_bps')::int >= 1000;
  if n > 0 then
    v_items := v_items || jsonb_build_object('kind', 'price_rises', 'count', n);
  end if;

  return jsonb_build_object('as_of', v_today, 'items', v_items);
end $analytics_attention$;

revoke all on function app.analytics_overview(date, date) from public, anon, authenticated;
revoke all on function app.analytics_menu_engineering(date, date) from public, anon, authenticated;
revoke all on function app.analytics_stock_losses(date, date) from public, anon, authenticated;
revoke all on function app.analytics_staff(date, date) from public, anon, authenticated;
revoke all on function app.analytics_weekday_hour(date, date) from public, anon, authenticated;
revoke all on function app.analytics_price_changes(date, date) from public, anon, authenticated;
revoke all on function app.analytics_table_turns(date, date) from public, anon, authenticated;
revoke all on function app.analytics_attention() from public, anon, authenticated;
grant execute on function app.analytics_overview(date, date) to authenticated;
grant execute on function app.analytics_menu_engineering(date, date) to authenticated;
grant execute on function app.analytics_stock_losses(date, date) to authenticated;
grant execute on function app.analytics_staff(date, date) to authenticated;
grant execute on function app.analytics_weekday_hour(date, date) to authenticated;
grant execute on function app.analytics_price_changes(date, date) to authenticated;
grant execute on function app.analytics_table_turns(date, date) to authenticated;
grant execute on function app.analytics_attention() to authenticated;
