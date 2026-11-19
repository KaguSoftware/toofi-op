-- 0020 tab totals: the one place a tab's numbers are computed.
--
-- Rules (mirrored case by case in packages/db/tests/money-totals-cases.json):
--   rd(n, d)  = floor((2n + d) / 2d): half-up division of non-negatives.
--   live lines = order_items of the tab with voided_at null, in id order.
--   subtotal S = sum(line_total); discount D = least(sum(tab_adjustments.amount), S).
--   D is spread over the live lines in proportion to line_total, cumulatively
--   (alloc_i = rd(D * cum_i, S) - rd(D * cum_(i-1), S)), so the shares sum to D.
--   Prices include tax: per tax rate r, tax = rd(net_r * r, 10000 + r).
--   total = S - D; paid = sum(payments); refunded = sum(refunds);
--   due = greatest(total - paid, 0). Refunds do not reopen due: a refund is
--   only taken on a settled tab.

-- rd(n, d): half-up integer division, n >= 0, d > 0. numeric, so D * cum never overflows.
create or replace function app.round_div(p_n numeric, p_d numeric) returns bigint
language sql immutable set search_path = public as $round_div$
  select div(2 * p_n + p_d, 2 * p_d)::bigint
$round_div$;

revoke all on function app.round_div(numeric, numeric) from public, anon, authenticated;

-- Each live line of a tab with its share of the discount. Internal.
create or replace function app.tab_line_discounts(p_tab_id uuid)
returns table (order_item_id uuid, line_total bigint, tax_rate_bps int, discount bigint)
language sql stable security definer set search_path = public as $tab_line_discounts$
  with l as (
    select oi.id, oi.line_total::bigint as lt, oi.tax_rate_bps,
           sum(oi.line_total) over (order by oi.id) as cum
      from order_items oi
     where oi.tab_id = p_tab_id and oi.voided_at is null
  ), s as (
    select coalesce(sum(lt), 0) as sub from l
  ), d as (
    select least(coalesce(sum(a.amount), 0), (select sub from s)) as disc
      from tab_adjustments a
     where a.tab_id = p_tab_id
  )
  select l.id, l.lt, l.tax_rate_bps,
         app.round_div(d.disc * l.cum, s.sub) - app.round_div(d.disc * (l.cum - l.lt), s.sub)
    from l, s, d
$tab_line_discounts$;

revoke all on function app.tab_line_discounts(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.compute_tab_totals(tab) -> {subtotal, discount, tax, total, paid, refunded, due}
-- Any staff of the tab's venue. Read-only.
-- ---------------------------------------------------------------------------
create or replace function app.compute_tab_totals(p_tab_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $compute_tab_totals$
declare
  v_sub      bigint;
  v_disc     bigint;
  v_tax      bigint;
  v_paid     bigint;
  v_refunded bigint;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (select 1 from tabs t where t.id = p_tab_id and t.venue_id = app.current_venue()) then
    raise exception 'TAB_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(sum(x.line_total), 0), coalesce(sum(x.discount), 0)
    into v_sub, v_disc
    from app.tab_line_discounts(p_tab_id) x;

  select coalesce(sum(app.round_div(g.net * g.r, 10000 + g.r)), 0)
    into v_tax
    from (select x.tax_rate_bps as r, sum(x.line_total - x.discount) as net
            from app.tab_line_discounts(p_tab_id) x
           group by x.tax_rate_bps) g;

  select coalesce(sum(p.amount), 0) into v_paid from payments p where p.tab_id = p_tab_id;
  select coalesce(sum(r.amount), 0) into v_refunded from refunds r where r.tab_id = p_tab_id;

  return jsonb_build_object(
    'subtotal', v_sub,
    'discount', v_disc,
    'tax',      v_tax,
    'total',    v_sub - v_disc,
    'paid',     v_paid,
    'refunded', v_refunded,
    'due',      greatest(v_sub - v_disc - v_paid, 0));
end $compute_tab_totals$;

revoke all on function app.compute_tab_totals(uuid) from public, anon, authenticated;
grant execute on function app.compute_tab_totals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: lock a tab of the caller's venue FOR UPDATE and require it open.
-- ---------------------------------------------------------------------------
create or replace function app.lock_open_tab(p_tab_id uuid) returns tabs
language plpgsql security definer set search_path = public as $lock_open_tab$
declare
  v_tab tabs%rowtype;
begin
  select * into v_tab from tabs t
   where t.id = p_tab_id and t.venue_id = app.current_venue()
   for update;
  if not found then
    raise exception 'TAB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_tab.status <> 'open' then
    raise exception 'TAB_NOT_OPEN' using errcode = 'P0001';
  end if;
  return v_tab;
end $lock_open_tab$;

revoke all on function app.lock_open_tab(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal: after a change to a locked open tab's money (payment, void,
-- discount), refuse a total below what was paid, and settle the tab when it
-- is paid in full. Returns the totals.
-- ---------------------------------------------------------------------------
create or replace function app.tab_after_change(p_tab_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $tab_after_change$
declare
  v_totals jsonb := app.compute_tab_totals(p_tab_id);
begin
  if (v_totals ->> 'paid')::bigint > (v_totals ->> 'total')::bigint then
    raise exception 'PAID_EXCEEDS_TOTAL' using errcode = 'P0001';
  end if;
  if (v_totals ->> 'paid')::bigint > 0 and (v_totals ->> 'due')::bigint = 0 then
    update tabs set status = 'settled', closed_at = now() where id = p_tab_id and status = 'open';
  end if;
  return v_totals;
end $tab_after_change$;

revoke all on function app.tab_after_change(uuid) from public, anon, authenticated;
