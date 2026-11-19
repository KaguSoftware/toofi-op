-- 0008 floor and menu tables. DDL only: admin functions belong to the catalog phase.

-- ---------------------------------------------------------------------------
-- Floor
-- ---------------------------------------------------------------------------
create table floor_areas (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  name_en    text not null check (btrim(name_en) <> ''),
  name_ar    text not null check (btrim(name_ar) <> ''),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index floor_areas_venue on floor_areas (venue_id, sort);

-- Named dining_tables because `tables` is too generic.
create table dining_tables (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  area_id    uuid not null references floor_areas (id),
  label      text not null check (btrim(label) <> ''),
  seats      int  not null default 4 check (seats > 0),
  grid_x     int  not null default 0 check (grid_x >= 0),
  grid_y     int  not null default 0 check (grid_y >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, label)
);
create index dining_tables_area on dining_tables (area_id);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table tax_groups (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  name       text not null check (btrim(name) <> ''),
  rate_bps   int  not null check (rate_bps between 0 and 10000),  -- prices include tax
  created_at timestamptz not null default now()
);

create table menu_categories (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  name_en    text not null check (btrim(name_en) <> ''),
  name_ar    text not null check (btrim(name_ar) <> ''),
  sort       int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index menu_categories_venue on menu_categories (venue_id, sort);

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null default app.current_venue() references venues (id),
  category_id  uuid not null references menu_categories (id),
  name_en      text not null check (btrim(name_en) <> ''),
  name_ar      text not null check (btrim(name_ar) <> ''),
  price        iqd  not null,                               -- tax-inclusive
  tax_group_id uuid not null references tax_groups (id),
  is_active    boolean not null default true,
  sort         int  not null default 0,
  created_at   timestamptz not null default now()
);
create index menu_items_category on menu_items (category_id, sort);
create index menu_items_tax_group on menu_items (tax_group_id);

create table modifier_groups (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  name_en    text not null check (btrim(name_en) <> ''),
  name_ar    text not null check (btrim(name_ar) <> ''),
  min_select int  not null default 0 check (min_select >= 0),
  max_select int  not null default 1 check (max_select >= 1),
  created_at timestamptz not null default now(),
  check (max_select >= min_select)
);

create table modifiers (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null default app.current_venue() references venues (id),
  group_id    uuid not null references modifier_groups (id),
  name_en     text not null check (btrim(name_en) <> ''),
  name_ar     text not null check (btrim(name_ar) <> ''),
  price_delta iqd_signed not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index modifiers_group on modifiers (group_id);

create table menu_item_modifier_groups (
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  group_id     uuid not null references modifier_groups (id) on delete cascade,
  venue_id     uuid not null default app.current_venue() references venues (id),
  created_at   timestamptz not null default now(),
  primary key (menu_item_id, group_id)
);
create index menu_item_modifier_groups_group on menu_item_modifier_groups (group_id);

-- ---------------------------------------------------------------------------
-- RLS: select-only for active staff of the venue. No client writes.
-- ---------------------------------------------------------------------------
do $rls_0008$
declare
  t text;
begin
  foreach t in array array['floor_areas', 'dining_tables', 'tax_groups', 'menu_categories',
                           'menu_items', 'modifier_groups', 'modifiers', 'menu_item_modifier_groups']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null)',
      t || '_staff_read', t);
  end loop;
end $rls_0008$;
