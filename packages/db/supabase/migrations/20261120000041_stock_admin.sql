-- 0041 stock admin: ingredients, suppliers, recipes. Manager and owner only.
-- Every function: role guard first, venue-scoped, audited, returns jsonb.
--
-- Shapes (numbers are JSON numbers; quantities numeric(12,3), cost numeric(14,4)):
--   upsert_ingredient      -> the ingredients row {id, venue_id, name_en, name_ar, unit,
--                             reorder_point, cost_per_unit, is_active, created_at}
--   set_ingredient_active  -> the same row
--   upsert_supplier        -> the suppliers row {id, venue_id, name, phone, created_at}
--   set_recipe             -> {menu_item_id, lines: [{ingredient_id, qty}]}
--
-- p_id NULL creates; a p_id that is not a row of the caller's venue raises
-- *_NOT_FOUND. These admin upserts take no idempotency key: a replayed update is
-- harmless, and a duplicated create is visible and editable in the admin list.

-- ---------------------------------------------------------------------------
-- upsert_ingredient. The unit is locked once any movement exists (UNIT_LOCKED):
-- on-hand is a sum of quantities in that unit, so changing it would silently
-- reinterpret the ledger.
-- ---------------------------------------------------------------------------
create or replace function app.upsert_ingredient(
  p_id            uuid,
  p_name_en       text,
  p_name_ar       text,
  p_unit          stock_unit,
  p_reorder_point numeric,
  p_cost_per_unit numeric
) returns jsonb
language plpgsql security definer set search_path = public as $upsert_ingredient$
declare
  v_before ingredients%rowtype;
  v_after  ingredients%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into ingredients (name_en, name_ar, unit, reorder_point, cost_per_unit)
    values (p_name_en, p_name_ar, p_unit, coalesce(p_reorder_point, 0), coalesce(p_cost_per_unit, 0))
    returning * into v_after;
  else
    select * into v_before from ingredients
     where id = p_id and venue_id = app.current_venue() for update;
    if not found then
      raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if p_unit is distinct from v_before.unit
       and exists (select 1 from stock_movements m where m.ingredient_id = p_id) then
      raise exception 'UNIT_LOCKED' using errcode = 'P0001';
    end if;
    update ingredients
       set name_en = p_name_en, name_ar = p_name_ar, unit = p_unit,
           reorder_point = coalesce(p_reorder_point, 0), cost_per_unit = coalesce(p_cost_per_unit, 0)
     where id = p_id
    returning * into v_after;
  end if;

  perform app.write_audit('ingredient.upsert', 'ingredients', v_after.id,
                          case when p_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  return to_jsonb(v_after);
end $upsert_ingredient$;

create or replace function app.set_ingredient_active(p_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $set_ingredient_active$
declare
  v_before ingredients%rowtype;
  v_after  ingredients%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_before from ingredients
   where id = p_id and venue_id = app.current_venue() for update;
  if not found then
    raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  update ingredients set is_active = coalesce(p_active, false) where id = p_id returning * into v_after;
  perform app.write_audit('ingredient.set_active', 'ingredients', p_id, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end $set_ingredient_active$;

-- ---------------------------------------------------------------------------
-- upsert_supplier
-- ---------------------------------------------------------------------------
create or replace function app.upsert_supplier(p_id uuid, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $upsert_supplier$
declare
  v_before suppliers%rowtype;
  v_after  suppliers%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into suppliers (name, phone) values (p_name, nullif(btrim(p_phone), ''))
    returning * into v_after;
  else
    select * into v_before from suppliers
     where id = p_id and venue_id = app.current_venue() for update;
    if not found then
      raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0001';
    end if;
    update suppliers set name = p_name, phone = nullif(btrim(p_phone), '')
     where id = p_id returning * into v_after;
  end if;

  perform app.write_audit('supplier.upsert', 'suppliers', v_after.id,
                          case when p_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  return to_jsonb(v_after);
end $upsert_supplier$;

-- ---------------------------------------------------------------------------
-- set_recipe(menu_item, [{ingredient_id, qty}]): replaces the item's recipe.
-- An empty array clears it. Movements already written keep the old recipe.
-- ---------------------------------------------------------------------------
create or replace function app.set_recipe(p_menu_item_id uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $set_recipe$
declare
  v_venue  uuid := app.current_venue();
  v_before jsonb;
  v_after  jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  perform 1 from menu_items where id = p_menu_item_id and venue_id = v_venue;
  if not found then
    raise exception 'RECIPE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'STOCK_LINES_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, qty numeric)
              where x.qty is null or x.qty <= 0) then
    raise exception 'STOCK_QTY_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, qty numeric)
              left join ingredients i on i.id = x.ingredient_id and i.venue_id = v_venue
              where i.id is null) then
    raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'qty', qty)
                            order by ingredient_id), '[]')
    into v_before from recipe_lines where menu_item_id = p_menu_item_id;

  delete from recipe_lines where menu_item_id = p_menu_item_id;
  insert into recipe_lines (menu_item_id, ingredient_id, qty)
  select p_menu_item_id, x.ingredient_id, x.qty
    from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, qty numeric);

  select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'qty', qty)
                            order by ingredient_id), '[]')
    into v_after from recipe_lines where menu_item_id = p_menu_item_id;

  perform app.write_audit('recipe.set', 'menu_items', p_menu_item_id,
                          jsonb_build_object('lines', v_before), jsonb_build_object('lines', v_after));
  return jsonb_build_object('menu_item_id', p_menu_item_id, 'lines', v_after);
end $set_recipe$;

revoke all on function app.upsert_ingredient(uuid, text, text, stock_unit, numeric, numeric) from public, anon, authenticated;
revoke all on function app.set_ingredient_active(uuid, boolean) from public, anon, authenticated;
revoke all on function app.upsert_supplier(uuid, text, text) from public, anon, authenticated;
revoke all on function app.set_recipe(uuid, jsonb) from public, anon, authenticated;
grant execute on function app.upsert_ingredient(uuid, text, text, stock_unit, numeric, numeric) to authenticated;
grant execute on function app.set_ingredient_active(uuid, boolean) to authenticated;
grant execute on function app.upsert_supplier(uuid, text, text) to authenticated;
grant execute on function app.set_recipe(uuid, jsonb) to authenticated;
