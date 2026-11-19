-- 0011 stock tables. DDL only: the sale-deduction trigger, stock functions and
-- views (v_low_stock) belong to the stock phase. stock_movements is the
-- append-only ledger: on-hand = the sum of movements, and it may go negative.

create table ingredients (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  name_en       text not null check (btrim(name_en) <> ''),
  name_ar       text not null check (btrim(name_ar) <> ''),
  unit          stock_unit not null,
  reorder_point numeric(12, 3) not null default 0 check (reorder_point >= 0),
  cost_per_unit numeric(14, 4) not null default 0 check (cost_per_unit >= 0),  -- IQD per unit
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index ingredients_venue on ingredients (venue_id);

-- How much of an ingredient one unit of a menu item uses.
create table recipe_lines (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  menu_item_id  uuid not null references menu_items (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id),
  qty           numeric(12, 3) not null check (qty > 0),
  created_at    timestamptz not null default now(),
  unique (menu_item_id, ingredient_id)
);
create index recipe_lines_ingredient on recipe_lines (ingredient_id);

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null default app.current_venue() references venues (id),
  name       text not null check (btrim(name) <> ''),
  phone      text,
  created_at timestamptz not null default now()
);

create table deliveries (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null default app.current_venue() references venues (id),
  supplier_id     uuid references suppliers (id),
  received_by     uuid not null references staff (id),
  received_at     timestamptz not null default now(),
  note            text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index deliveries_supplier on deliveries (supplier_id);

create table delivery_lines (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  delivery_id   uuid not null references deliveries (id),
  ingredient_id uuid not null references ingredients (id),
  qty           numeric(12, 3) not null check (qty > 0),
  unit_cost     numeric(14, 4) not null check (unit_cost >= 0),
  created_at    timestamptz not null default now()
);
create index delivery_lines_delivery on delivery_lines (delivery_id);
create index delivery_lines_ingredient on delivery_lines (ingredient_id);

-- A blind physical count; finalizing it writes count_adjust movements.
create table stock_counts (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null default app.current_venue() references venues (id),
  started_by   uuid not null references staff (id),
  started_at   timestamptz not null default now(),
  finalized_by uuid references staff (id),
  finalized_at timestamptz,
  created_at   timestamptz not null default now(),
  check ((finalized_at is null) = (finalized_by is null))
);
-- At most one count in progress per venue.
create unique index stock_counts_one_open on stock_counts (venue_id) where finalized_at is null;

create table stock_count_lines (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  count_id      uuid not null references stock_counts (id),
  ingredient_id uuid not null references ingredients (id),
  expected      numeric(12, 3) not null,     -- on-hand when counted (may be negative)
  counted       numeric(12, 3) check (counted >= 0),
  created_at    timestamptz not null default now(),
  unique (count_id, ingredient_id)
);
create index stock_count_lines_ingredient on stock_count_lines (ingredient_id);

-- The ledger. qty is signed: in for delivery and void_return, out for sale and
-- waste, either way for count_adjust. ref_table/ref_id point at the source row.
create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  ingredient_id uuid not null references ingredients (id),
  kind          movement_kind not null,
  qty           numeric(12, 3) not null,
  unit_cost     numeric(14, 4) check (unit_cost >= 0),
  ref_table     text,
  ref_id        uuid,
  actor_id      uuid,                        -- auth.uid(); NULL for system writes
  created_at    timestamptz not null default now(),
  check (
    (kind in ('delivery', 'void_return') and qty > 0)
    or (kind in ('sale', 'waste') and qty < 0)
    or (kind = 'count_adjust' and qty <> 0)
  )
);
create index stock_movements_ingredient on stock_movements (ingredient_id, created_at);
create index stock_movements_ref on stock_movements (ref_table, ref_id);
create index stock_movements_venue_created on stock_movements (venue_id, created_at);

-- ---------------------------------------------------------------------------
-- Append-only: stock_movements.
-- ---------------------------------------------------------------------------
revoke update, delete, truncate on stock_movements from service_role;
create trigger stock_movements_append_only
  before update or delete or truncate on stock_movements
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS: select-only for active staff of the venue. Cost columns are readable by
-- all staff in v1 (accepted in SPEC). No client writes.
-- ---------------------------------------------------------------------------
do $rls_0011$
declare
  t text;
begin
  foreach t in array array['ingredients', 'recipe_lines', 'suppliers', 'deliveries', 'delivery_lines',
                           'stock_counts', 'stock_count_lines', 'stock_movements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null)',
      t || '_staff_read', t);
  end loop;
end $rls_0011$;
