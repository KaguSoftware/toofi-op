-- 0043 stock views. security_invoker = true: the reader's RLS on the underlying
-- tables applies (active staff of the venue), so a view never widens access.
-- Money columns are rounded to whole IQD (bigint); quantities stay numeric.
--
--   v_ingredient_on_hand  ingredient_id, venue_id, name_en, name_ar, unit, reorder_point,
--                         cost_per_unit, is_active, on_hand (sum of the ledger, may be
--                         negative), value (round(on_hand x cost_per_unit), IQD, signed)
--   v_low_stock           the same columns, active ingredients with on_hand <= reorder_point
--   v_item_cost           menu_item_id, venue_id, name_en, name_ar, price, cost (recipe at the
--                         current cost_per_unit, IQD), margin (price - cost), has_recipe

create view v_ingredient_on_hand with (security_invoker = true) as
select i.id as ingredient_id,
       i.venue_id,
       i.name_en,
       i.name_ar,
       i.unit,
       i.reorder_point,
       i.cost_per_unit,
       i.is_active,
       coalesce(m.on_hand, 0)::numeric(12, 3) as on_hand,
       round(coalesce(m.on_hand, 0) * i.cost_per_unit)::bigint as value
  from ingredients i
  left join (select ingredient_id, sum(qty) as on_hand from stock_movements group by ingredient_id) m
    on m.ingredient_id = i.id;

create view v_low_stock with (security_invoker = true) as
select *
  from v_ingredient_on_hand
 where is_active and on_hand <= reorder_point;

create view v_item_cost with (security_invoker = true) as
select mi.id as menu_item_id,
       mi.venue_id,
       mi.name_en,
       mi.name_ar,
       mi.price::bigint as price,
       round(coalesce(sum(rl.qty * i.cost_per_unit), 0))::bigint as cost,
       mi.price - round(coalesce(sum(rl.qty * i.cost_per_unit), 0))::bigint as margin,
       count(rl.id) > 0 as has_recipe
  from menu_items mi
  left join recipe_lines rl on rl.menu_item_id = mi.id
  left join ingredients i on i.id = rl.ingredient_id
 group by mi.id;

revoke all on v_ingredient_on_hand, v_low_stock, v_item_cost from anon, authenticated;
grant select on v_ingredient_on_hand, v_low_stock, v_item_cost to authenticated;
