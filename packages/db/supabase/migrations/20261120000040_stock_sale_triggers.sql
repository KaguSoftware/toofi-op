-- 0040 stock follows the service: triggers on order_items write the ledger.
--
--  * AFTER INSERT on order_items: one `sale` movement per recipe line of the
--    line's menu item, qty = -(recipe qty x line qty), unit_cost = the
--    ingredient's cost_per_unit at that moment, ref = ('order_items', line id).
--    The recipe and cost are read at the time of the sale; later edits do not
--    touch movements already written. An item without a recipe moves nothing.
--  * A sale is NEVER blocked by stock: on-hand may go negative. No lock is taken
--    on ingredients here (lock order: order_items -> ingredients ->
--    stock_movements; we only append to stock_movements).
--  * AFTER UPDATE when voided_at goes from NULL to set: one `void_return`
--    movement per `sale` movement of that line, reversing its qty at the same
--    unit_cost. Voiding reverses what the sale took, not today's recipe.
--  * Refunds do NOT restock in v1: a refund is money only. Food that was served
--    and refunded is gone; a line that should not have been made is voided.
--
-- Trigger functions are SECURITY DEFINER so the ledger write succeeds whichever
-- role wrote the line; actor_id is still the caller's auth.uid().

create or replace function app.stock_on_sale() returns trigger
language plpgsql security definer set search_path = public as $stock_on_sale$
begin
  insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, ref_table, ref_id, actor_id)
  select new.venue_id, rl.ingredient_id, 'sale', -(rl.qty * new.qty), i.cost_per_unit,
         'order_items', new.id, auth.uid()
    from recipe_lines rl
    join ingredients i on i.id = rl.ingredient_id
   where rl.menu_item_id = new.menu_item_id;
  return null;
end $stock_on_sale$;

create or replace function app.stock_on_void() returns trigger
language plpgsql security definer set search_path = public as $stock_on_void$
begin
  insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, ref_table, ref_id, actor_id)
  select m.venue_id, m.ingredient_id, 'void_return', -m.qty, m.unit_cost,
         'order_items', new.id, auth.uid()
    from stock_movements m
   where m.ref_table = 'order_items' and m.ref_id = new.id and m.kind = 'sale';
  return null;
end $stock_on_void$;

revoke all on function app.stock_on_sale() from public, anon, authenticated;
revoke all on function app.stock_on_void() from public, anon, authenticated;

create trigger order_items_stock_sale
  after insert on order_items
  for each row execute function app.stock_on_sale();

create trigger order_items_stock_void
  after update of voided_at on order_items
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function app.stock_on_void();
