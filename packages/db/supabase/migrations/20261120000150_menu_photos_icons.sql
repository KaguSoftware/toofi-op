-- 0150 dish photos and category icons: the two columns and their setters
-- (manager and owner, audited, listed in tests/rls-matrix.ts). Contract:
-- .scratch/qr-menu/issues/02-photos-and-icons-db.md.
--
-- upsert_menu_category and upsert_menu_item are left alone on purpose: two small
-- setters are less risk than changing those signatures.

-- ---------------------------------------------------------------------------
-- Columns. The icon keys match CATEGORY_ICONS in @rop/core; this check is the
-- one list in the database (set_menu_category_icon relies on it).
-- photo_path is the object's path inside the `menu-photos` bucket (0151), never
-- a URL: {venue_id}/items/{item_id}/{file}.
-- ---------------------------------------------------------------------------
alter table menu_categories
  add column icon text not null default 'dish'
    constraint menu_categories_icon_check
    check (icon in ('dish', 'mezze', 'grill', 'main', 'sandwich', 'dessert', 'hot_drink', 'cold_drink'));

alter table menu_items add column photo_path text;

-- ---------------------------------------------------------------------------
-- app.set_menu_category_icon(category, icon) -> {category_id, icon}
-- Unknown, blank or null key: INVALID_ICON. Unknown category: CATEGORY_NOT_FOUND.
-- ---------------------------------------------------------------------------
create or replace function app.set_menu_category_icon(p_category_id uuid, p_icon text) returns jsonb
language plpgsql security definer set search_path = public as $set_menu_category_icon$
declare
  v_before text;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select c.icon into v_before from menu_categories c
   where c.id = p_category_id and c.venue_id = app.current_venue() for update;
  if not found then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_icon is null then
    raise exception 'INVALID_ICON' using errcode = 'P0001';
  end if;
  begin
    update menu_categories set icon = p_icon where id = p_category_id;
  exception when check_violation then
    raise exception 'INVALID_ICON' using errcode = 'P0001';
  end;
  perform app.write_audit('menu_category.set_icon', 'menu_categories', p_category_id,
    jsonb_build_object('icon', v_before), jsonb_build_object('icon', p_icon));
  return jsonb_build_object('category_id', p_category_id, 'icon', p_icon);
end $set_menu_category_icon$;

-- ---------------------------------------------------------------------------
-- app.set_menu_item_photo(item, path) -> {menu_item_id, photo_path}
-- The path must be {venue_id}/items/{item_id}/{file}, where {file} is one plain
-- name (letters, digits, '.', '_', '-'; not starting with '.'), so it can never
-- climb out of the folder once it is put into a URL. Null clears the photo. The
-- object itself is uploaded and removed by the staff app under the bucket's
-- policy; this records the path. Unknown item: ITEM_NOT_FOUND.
-- ---------------------------------------------------------------------------
create or replace function app.set_menu_item_photo(p_item_id uuid, p_photo_path text) returns jsonb
language plpgsql security definer set search_path = public as $set_menu_item_photo$
declare
  v_item   record;
  v_prefix text;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select i.id, i.venue_id, i.photo_path into v_item from menu_items i
   where i.id = p_item_id and i.venue_id = app.current_venue() for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_prefix := v_item.venue_id::text || '/items/' || v_item.id::text || '/';
  if p_photo_path is not null
     and not (starts_with(p_photo_path, v_prefix)
              and substr(p_photo_path, length(v_prefix) + 1) ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$') then
    raise exception 'PHOTO_PATH_INVALID' using errcode = 'P0001';
  end if;
  update menu_items set photo_path = p_photo_path where id = p_item_id;
  perform app.write_audit('menu_item.set_photo', 'menu_items', p_item_id,
    jsonb_build_object('photo_path', v_item.photo_path), jsonb_build_object('photo_path', p_photo_path));
  return jsonb_build_object('menu_item_id', p_item_id, 'photo_path', p_photo_path);
end $set_menu_item_photo$;

revoke all on function app.set_menu_category_icon(uuid, text) from public, anon, authenticated;
revoke all on function app.set_menu_item_photo(uuid, text) from public, anon, authenticated;
grant execute on function app.set_menu_category_icon(uuid, text) to authenticated;
grant execute on function app.set_menu_item_photo(uuid, text) to authenticated;
