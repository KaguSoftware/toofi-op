-- 0124 analytics basis: calendar date, not the business day of close_day.
--
-- Two different ways of dating the same money, both correct for their purpose.
-- The analytics maths is NOT changed here; this only names the basis.
--
--   Analytics (0044: analytics_*, panel_headline, report_item_margins) date
--   every event by its OWN timestamp, as a calendar date in the venue time zone:
--   a payment by its created_at, a refund by its created_at, a line by its Send.
--   A tab opened at 23:30 and paid at 00:15 lands on the next calendar date.
--
--   close_day (0021 / 0083) summarises one BUSINESS DAY (day_sessions): the
--   tabs of that session, whenever their money moved, and the refunds given
--   back during it. Its summary is frozen when the day is closed and is the
--   authoritative figure for that business day.
--
-- So the two can differ around midnight and for a day left open past it. The UI
-- labels analytics "figures by calendar date; the day-close summary is
-- authoritative per business day". panel_headline answers basis:
-- 'calendar_date' so the client can show that label; its other fields are
-- unchanged.

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
    'basis', 'calendar_date',
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

revoke all on function app.panel_headline(date, date) from public, anon, authenticated;
grant execute on function app.panel_headline(date, date) to authenticated;
