-- 0061 menu admin: tax groups, categories, items. Manager and owner only.
-- Nothing a sale could reference is deleted: items and categories are deactivated
-- (they stay readable). Order lines snapshot name, price and tax at send time.

create or replace function app.upsert_tax_group(p_id uuid, p_name text, p_rate_bps int) returns uuid
language plpgsql security definer set search_path = public as $upsert_tax_group$
declare
  v_before jsonb;
  v_id uuid := p_id;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_rate_bps is null or p_rate_bps < 0 or p_rate_bps > 10000 then
    raise exception 'TAX_RATE_INVALID' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into tax_groups (name, rate_bps) values (btrim(p_name), p_rate_bps) returning id into v_id;
    perform app.write_audit('tax_group.create', 'tax_groups', v_id, null,
      (select to_jsonb(g) from tax_groups g where g.id = v_id));
  else
    select to_jsonb(g) into v_before from tax_groups g
     where g.id = p_id and g.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'TAX_GROUP_NOT_FOUND' using errcode = 'P0001';
    end if;
    update tax_groups set name = btrim(p_name), rate_bps = p_rate_bps where id = p_id;
    perform app.write_audit('tax_group.update', 'tax_groups', p_id, v_before,
      (select to_jsonb(g) from tax_groups g where g.id = p_id));
  end if;
  return v_id;
end $upsert_tax_group$;

create or replace function app.upsert_menu_category(
  p_id uuid, p_name_en text, p_name_ar text, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $upsert_menu_category$
declare
  v_before jsonb;
  v_id uuid := p_id;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_name_en is null or btrim(p_name_en) = '' or p_name_ar is null or btrim(p_name_ar) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into menu_categories (name_en, name_ar, sort)
    values (btrim(p_name_en), btrim(p_name_ar), coalesce(p_sort, 0)) returning id into v_id;
    perform app.write_audit('menu_category.create', 'menu_categories', v_id, null,
      (select to_jsonb(c) from menu_categories c where c.id = v_id));
  else
    select to_jsonb(c) into v_before from menu_categories c
     where c.id = p_id and c.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
    end if;
    update menu_categories
       set name_en = btrim(p_name_en), name_ar = btrim(p_name_ar), sort = coalesce(p_sort, sort)
     where id = p_id;
    perform app.write_audit('menu_category.update', 'menu_categories', p_id, v_before,
      (select to_jsonb(c) from menu_categories c where c.id = p_id));
  end if;
  return v_id;
end $upsert_menu_category$;

create or replace function app.set_menu_category_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $set_menu_category_active$
declare
  v_before jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select to_jsonb(c) into v_before from menu_categories c
   where c.id = p_id and c.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  update menu_categories set is_active = p_active where id = p_id;
  perform app.write_audit('menu_category.set_active', 'menu_categories', p_id, v_before,
    jsonb_build_object('is_active', p_active));
end $set_menu_category_active$;

create or replace function app.upsert_menu_item(
  p_id uuid, p_category_id uuid, p_name_en text, p_name_ar text, p_price bigint,
  p_tax_group_id uuid, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $upsert_menu_item$
declare
  v_before jsonb;
  v_id uuid := p_id;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_name_en is null or btrim(p_name_en) = '' or p_name_ar is null or btrim(p_name_ar) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from menu_categories c where c.id = p_category_id and c.venue_id = app.current_venue()) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from tax_groups g where g.id = p_tax_group_id and g.venue_id = app.current_venue()) then
    raise exception 'TAX_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into menu_items (category_id, name_en, name_ar, price, tax_group_id, sort)
    values (p_category_id, btrim(p_name_en), btrim(p_name_ar), p_price, p_tax_group_id, coalesce(p_sort, 0))
    returning id into v_id;
    perform app.write_audit('menu_item.create', 'menu_items', v_id, null,
      (select to_jsonb(i) from menu_items i where i.id = v_id));
  else
    select to_jsonb(i) into v_before from menu_items i
     where i.id = p_id and i.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
    end if;
    update menu_items
       set category_id = p_category_id, name_en = btrim(p_name_en), name_ar = btrim(p_name_ar),
           price = p_price, tax_group_id = p_tax_group_id, sort = coalesce(p_sort, sort)
     where id = p_id;
    perform app.write_audit('menu_item.update', 'menu_items', p_id, v_before,
      (select to_jsonb(i) from menu_items i where i.id = p_id));
  end if;
  return v_id;
end $upsert_menu_item$;

create or replace function app.set_menu_item_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $set_menu_item_active$
declare
  v_before jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select to_jsonb(i) into v_before from menu_items i
   where i.id = p_id and i.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  update menu_items set is_active = p_active where id = p_id;
  perform app.write_audit('menu_item.set_active', 'menu_items', p_id, v_before,
    jsonb_build_object('is_active', p_active));
end $set_menu_item_active$;

revoke all on function app.upsert_tax_group(uuid, text, int) from public, anon, authenticated;
revoke all on function app.upsert_menu_category(uuid, text, text, int) from public, anon, authenticated;
revoke all on function app.set_menu_category_active(uuid, boolean) from public, anon, authenticated;
revoke all on function app.upsert_menu_item(uuid, uuid, text, text, bigint, uuid, int) from public, anon, authenticated;
revoke all on function app.set_menu_item_active(uuid, boolean) from public, anon, authenticated;
grant execute on function app.upsert_tax_group(uuid, text, int) to authenticated;
grant execute on function app.upsert_menu_category(uuid, text, text, int) to authenticated;
grant execute on function app.set_menu_category_active(uuid, boolean) to authenticated;
grant execute on function app.upsert_menu_item(uuid, uuid, text, text, bigint, uuid, int) to authenticated;
grant execute on function app.set_menu_item_active(uuid, boolean) to authenticated;
