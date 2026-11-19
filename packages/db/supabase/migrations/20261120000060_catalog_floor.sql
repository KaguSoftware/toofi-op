-- 0060 floor admin: areas and tables. Manager and owner only. Tables a tab could
-- reference are never deleted, only deactivated.

create or replace function app.upsert_floor_area(
  p_id uuid, p_name_en text, p_name_ar text, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $upsert_floor_area$
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
    insert into floor_areas (name_en, name_ar, sort)
    values (btrim(p_name_en), btrim(p_name_ar), coalesce(p_sort, 0))
    returning id into v_id;
    perform app.write_audit('floor_area.create', 'floor_areas', v_id, null,
      (select to_jsonb(a) from floor_areas a where a.id = v_id));
  else
    select to_jsonb(a) into v_before from floor_areas a
     where a.id = p_id and a.venue_id = app.current_venue() for update;
    if v_before is null then
      raise exception 'AREA_NOT_FOUND' using errcode = 'P0001';
    end if;
    update floor_areas
       set name_en = btrim(p_name_en), name_ar = btrim(p_name_ar), sort = coalesce(p_sort, sort)
     where id = p_id;
    perform app.write_audit('floor_area.update', 'floor_areas', p_id, v_before,
      (select to_jsonb(a) from floor_areas a where a.id = p_id));
  end if;
  return v_id;
end $upsert_floor_area$;

create or replace function app.upsert_dining_table(
  p_id uuid, p_area_id uuid, p_label text, p_seats int default 4,
  p_grid_x int default 0, p_grid_y int default 0
) returns uuid
language plpgsql security definer set search_path = public as $upsert_dining_table$
declare
  v_before jsonb;
  v_id uuid := p_id;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_label is null or btrim(p_label) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_seats is null or p_seats < 1 then
    raise exception 'SEATS_INVALID' using errcode = 'P0001';
  end if;
  if p_grid_x is null or p_grid_y is null or p_grid_x < 0 or p_grid_y < 0 then
    raise exception 'GRID_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from floor_areas a where a.id = p_area_id and a.venue_id = app.current_venue()) then
    raise exception 'AREA_NOT_FOUND' using errcode = 'P0001';
  end if;

  begin
    if p_id is null then
      insert into dining_tables (area_id, label, seats, grid_x, grid_y)
      values (p_area_id, btrim(p_label), p_seats, p_grid_x, p_grid_y)
      returning id into v_id;
      perform app.write_audit('dining_table.create', 'dining_tables', v_id, null,
        (select to_jsonb(t) from dining_tables t where t.id = v_id));
    else
      select to_jsonb(t) into v_before from dining_tables t
       where t.id = p_id and t.venue_id = app.current_venue() for update;
      if v_before is null then
        raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
      end if;
      update dining_tables
         set area_id = p_area_id, label = btrim(p_label), seats = p_seats,
             grid_x = p_grid_x, grid_y = p_grid_y
       where id = p_id;
      perform app.write_audit('dining_table.update', 'dining_tables', p_id, v_before,
        (select to_jsonb(t) from dining_tables t where t.id = p_id));
    end if;
  exception when unique_violation then
    raise exception 'TABLE_LABEL_TAKEN' using errcode = 'P0001';
  end;
  return v_id;
end $upsert_dining_table$;

create or replace function app.set_dining_table_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $set_dining_table_active$
declare
  v_before jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select to_jsonb(t) into v_before from dining_tables t
   where t.id = p_id and t.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  if not p_active and exists (select 1 from tabs b where b.table_id = p_id and b.status = 'open') then
    raise exception 'TABLE_HAS_OPEN_TAB' using errcode = 'P0001';
  end if;
  update dining_tables set is_active = p_active where id = p_id;
  perform app.write_audit('dining_table.set_active', 'dining_tables', p_id, v_before,
    jsonb_build_object('is_active', p_active));
end $set_dining_table_active$;

revoke all on function app.upsert_floor_area(uuid, text, text, int) from public, anon, authenticated;
revoke all on function app.upsert_dining_table(uuid, uuid, text, int, int, int) from public, anon, authenticated;
revoke all on function app.set_dining_table_active(uuid, boolean) from public, anon, authenticated;
grant execute on function app.upsert_floor_area(uuid, text, text, int) to authenticated;
grant execute on function app.upsert_dining_table(uuid, uuid, text, int, int, int) to authenticated;
grant execute on function app.set_dining_table_active(uuid, boolean) to authenticated;
