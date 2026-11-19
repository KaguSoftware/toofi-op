-- 0081 tab totals (review fixes). Mirrored by @rop/core money/tabTotals.ts and
-- proven case by case against money/__fixtures__/tab-totals-cases.json.
--
-- Changes to the 0020 rules:
--   * A discount_percent row is re-derived from the CURRENT live subtotal:
--     rd(S * value, 10000) each, half up. Its stored `amount` is what it took off
--     when applied (history, analytics) and no longer counts in the totals, so
--     voiding a line after a 10% discount leaves 10% of what is left, not a fixed
--     sum that can swallow the whole tab.
--   * A discount_amount row stays at its stored amount (fixed when applied).
--   * D = least(sum of both, S), as before.
--   * S = 0 (every live line priced 0, or none): every share is 0. 0020 divided
--     by S here and raised division_by_zero.
--   * tab_after_change settles a tab at due = 0 when something was paid OR a
--     discount brought it there: a tab discounted to 0 used to stay open forever,
--     because settle_tab refuses an amount of 0.

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
    select least(coalesce(sum(case when a.kind = 'discount_percent'
                                   then app.round_div(s.sub * a.value, 10000)
                                   else a.amount end), 0),
                 s.sub) as disc
      from s
      left join tab_adjustments a on a.tab_id = p_tab_id
     group by s.sub
  )
  select l.id, l.lt, l.tax_rate_bps,
         case when s.sub = 0 then 0
              else app.round_div(d.disc * l.cum, s.sub) - app.round_div(d.disc * (l.cum - l.lt), s.sub) end
    from l, s, d
$tab_line_discounts$;

revoke all on function app.tab_line_discounts(uuid) from public, anon, authenticated;

create or replace function app.tab_after_change(p_tab_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $tab_after_change$
declare
  v_totals jsonb := app.compute_tab_totals(p_tab_id);
begin
  if (v_totals ->> 'paid')::bigint > (v_totals ->> 'total')::bigint then
    raise exception 'PAID_EXCEEDS_TOTAL' using errcode = 'P0001';
  end if;
  if (v_totals ->> 'due')::bigint = 0
     and ((v_totals ->> 'paid')::bigint > 0 or (v_totals ->> 'discount')::bigint > 0) then
    update tabs set status = 'settled', closed_at = now() where id = p_tab_id and status = 'open';
  end if;
  return v_totals;
end $tab_after_change$;

revoke all on function app.tab_after_change(uuid) from public, anon, authenticated;

-- split_by_item is unchanged (it reads tab_line_discounts). Decided, not changed:
-- payments are not tied to lines, so the server cannot know which lines an
-- earlier part payment covered. Its amount is least(sum of the chosen lines'
-- discounted shares, due): never more than is left to pay, but a line paid for
-- in an earlier split can be chosen again. The till keeps track of which lines
-- it has already split off.
comment on function app.split_by_item(uuid, uuid[]) is
  'amount = least(sum of the chosen live lines net of their discount share, due). Payments are not tied to lines, so a line already paid in an earlier split is not excluded; the amount is only capped at what is due.';
