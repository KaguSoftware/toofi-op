-- 0062 modifier admin and menu ordering. Manager and owner only.

create or replace function app.upsert_modifier_group(
  p_id uuid, p_name_en text, p_name_ar text, p_min_select int default 0, p_max_select int default 1
) returns uuid
language plpgsql security definer set search_path = public as $upsert_modifier_group$
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
  if p_min_select is null or p_max_select is null
     or p_min_select < 0 or p_max_select < 1 or p_min_select > p_max_select then
    raise exception 'MODIFIER_RANGE_INVALID' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into modifier_groups (name_en, name_ar, min_select, max_select)
    values (btrim(p_name_en), btrim(p_name_ar), p_min_select, p_max_select) returning id into v_id;
    perform app.write_audit('modifier_group.create', 'modifier_groups', v_id, null,
      (select to_jsonb(g) from modifier_groups g where g.id = v_id));
  else
    select to_jsonb(g) into v_before from modifier_groups g
     where g.id = p_id and g.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'MODIFIER_GROUP_NOT_FOUND' using errcode = 'P0001';
    end if;
    update modifier_groups
       set name_en = btrim(p_name_en), name_ar = btrim(p_name_ar),
           min_select = p_min_select, max_select = p_max_select
     where id = p_id;
    perform app.write_audit('modifier_group.update', 'modifier_groups', p_id, v_before,
      (select to_jsonb(g) from modifier_groups g where g.id = p_id));
  end if;
  return v_id;
end $upsert_modifier_group$;

create or replace function app.upsert_modifier(
  p_id uuid, p_group_id uuid, p_name_en text, p_name_ar text, p_price_delta bigint default 0
) returns uuid
language plpgsql security definer set search_path = public as $upsert_modifier$
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
  if p_price_delta is null then
    raise exception 'PRICE_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from modifier_groups g where g.id = p_group_id and g.venue_id = app.current_venue()) then
    raise exception 'MODIFIER_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into modifiers (group_id, name_en, name_ar, price_delta)
    values (p_group_id, btrim(p_name_en), btrim(p_name_ar), p_price_delta) returning id into v_id;
    perform app.write_audit('modifier.create', 'modifiers', v_id, null,
      (select to_jsonb(m) from modifiers m where m.id = v_id));
  else
    select to_jsonb(m) into v_before from modifiers m
     where m.id = p_id and m.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'MODIFIER_NOT_FOUND' using errcode = 'P0001';
    end if;
    update modifiers
       set group_id = p_group_id, name_en = btrim(p_name_en), name_ar = btrim(p_name_ar),
           price_delta = p_price_delta
     where id = p_id;
    perform app.write_audit('modifier.update', 'modifiers', p_id, v_before,
      (select to_jsonb(m) from modifiers m where m.id = p_id));
  end if;
  return v_id;
end $upsert_modifier$;

create or replace function app.set_modifier_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $set_modifier_active$
declare
  v_before jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select to_jsonb(m) into v_before from modifiers m
   where m.id = p_id and m.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'MODIFIER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  update modifiers set is_active = p_active where id = p_id;
  perform app.write_audit('modifier.set_active', 'modifiers', p_id, v_before,
    jsonb_build_object('is_active', p_active));
end $set_modifier_active$;

-- Replaces the set of modifier groups attached to an item.
create or replace function app.set_item_modifier_groups(p_menu_item_id uuid, p_group_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $set_item_modifier_groups$
declare
  v_ids uuid[];
  v_before jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (select 1 from menu_items i where i.id = p_menu_item_id and i.venue_id = app.current_venue()) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_group_ids, '{}')) x;
  if (select count(*) from modifier_groups g
       where g.id = any (v_ids) and g.venue_id = app.current_venue()) <> cardinality(v_ids) then
    raise exception 'MODIFIER_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(l.group_id order by l.group_id), '[]') into v_before
    from menu_item_modifier_groups l where l.menu_item_id = p_menu_item_id;
  delete from menu_item_modifier_groups where menu_item_id = p_menu_item_id;
  insert into menu_item_modifier_groups (menu_item_id, group_id)
  select p_menu_item_id, x from unnest(v_ids) x;
  perform app.write_audit('menu_item.set_modifier_groups', 'menu_items', p_menu_item_id,
    jsonb_build_object('group_ids', v_before), jsonb_build_object('group_ids', to_jsonb(v_ids)));
end $set_item_modifier_groups$;

-- Rewrites `sort` to the position in p_ids (1, 2, 3...). p_kind: area | category | item.
create or replace function app.reorder_menu(p_kind text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $reorder_menu$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
  v_found int;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('area', 'category', 'item') then
    raise exception 'REORDER_KIND_INVALID' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'REORDER_IDS_INVALID' using errcode = 'P0001';
  end if;

  if p_kind = 'area' then
    select count(*) into v_found from floor_areas where id = any (v_ids) and venue_id = app.current_venue();
  elsif p_kind = 'category' then
    select count(*) into v_found from menu_categories where id = any (v_ids) and venue_id = app.current_venue();
  else
    select count(*) into v_found from menu_items where id = any (v_ids) and venue_id = app.current_venue();
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception 'REORDER_IDS_INVALID' using errcode = 'P0001';
  end if;

  if p_kind = 'area' then
    update floor_areas a set sort = o.n from unnest(v_ids) with ordinality o(id, n) where a.id = o.id;
  elsif p_kind = 'category' then
    update menu_categories a set sort = o.n from unnest(v_ids) with ordinality o(id, n) where a.id = o.id;
  else
    update menu_items a set sort = o.n from unnest(v_ids) with ordinality o(id, n) where a.id = o.id;
  end if;
  perform app.write_audit('menu.reorder', p_kind, null, null, jsonb_build_object('ids', to_jsonb(v_ids)));
end $reorder_menu$;

revoke all on function app.upsert_modifier_group(uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function app.upsert_modifier(uuid, uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function app.set_modifier_active(uuid, boolean) from public, anon, authenticated;
revoke all on function app.set_item_modifier_groups(uuid, uuid[]) from public, anon, authenticated;
revoke all on function app.reorder_menu(text, uuid[]) from public, anon, authenticated;
grant execute on function app.upsert_modifier_group(uuid, text, text, int, int) to authenticated;
grant execute on function app.upsert_modifier(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function app.set_modifier_active(uuid, boolean) to authenticated;
grant execute on function app.set_item_modifier_groups(uuid, uuid[]) to authenticated;
grant execute on function app.reorder_menu(text, uuid[]) to authenticated;
