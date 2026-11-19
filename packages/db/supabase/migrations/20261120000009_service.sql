-- 0009 service tables: business days, tabs, orders and lines. DDL only: the day,
-- tab and order functions belong to the money phase.

create table day_sessions (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  business_date date not null,                 -- app.business_date(now()) at open
  opened_by     uuid not null references staff (id),
  opened_at     timestamptz not null default now(),
  closed_by     uuid references staff (id),
  closed_at     timestamptz,
  summary       jsonb,                         -- close snapshot: gross, discounts, refunds, net, cash, card, voids, covers
  created_at    timestamptz not null default now(),
  unique (venue_id, business_date),
  check ((closed_at is null) = (closed_by is null))
);
-- At most one open business day per venue.
create unique index day_sessions_one_open on day_sessions (venue_id) where closed_at is null;

create table tabs (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null default app.current_venue() references venues (id),
  day_session_id     uuid not null references day_sessions (id),
  table_id           uuid references dining_tables (id),   -- NULL: no table (e.g. takeaway)
  waiter_id          uuid not null references staff (id),
  covers             int  not null default 1 check (covers >= 1),
  status             tab_status not null default 'open',
  opened_at          timestamptz not null default now(),
  closed_at          timestamptz,
  merged_into_tab_id uuid references tabs (id),
  note               text,
  idempotency_key    text not null unique,
  created_at         timestamptz not null default now(),
  check ((status = 'open') = (closed_at is null)),
  check (merged_into_tab_id is null or merged_into_tab_id <> id)
);
-- One open tab per table (TABLE_OCCUPIED is raised from the unique violation).
create unique index tabs_one_open_per_table on tabs (table_id) where status = 'open' and table_id is not null;
create index tabs_venue_open on tabs (venue_id) where status = 'open';
create index tabs_day_session on tabs (day_session_id);
create index tabs_waiter on tabs (waiter_id);
create index tabs_merged_into on tabs (merged_into_tab_id) where merged_into_tab_id is not null;

-- One Send of the basket to a tab.
create table orders (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null default app.current_venue() references venues (id),
  tab_id          uuid not null references tabs (id),
  placed_by       uuid not null references staff (id),
  placed_at       timestamptz not null default now(),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index orders_tab on orders (tab_id);

-- One menu item at a quantity, with price and name snapshots taken at Send.
create table order_items (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null default app.current_venue() references venues (id),
  order_id           uuid not null references orders (id),
  tab_id             uuid not null references tabs (id),   -- denormalised; moves on transfer/merge
  menu_item_id       uuid not null references menu_items (id),
  name_en            text not null,
  name_ar            text not null,
  unit_price         iqd  not null,                        -- item price + modifier deltas, tax-inclusive
  qty                int  not null check (qty > 0),
  line_total         iqd  not null,                        -- unit_price * qty
  tax_rate_bps       int  not null check (tax_rate_bps between 0 and 10000),
  note               text,
  voided_at          timestamptz,
  voided_by          uuid references staff (id),
  void_reason        text,
  void_authorized_by uuid references staff (id),
  created_at         timestamptz not null default now(),
  check (line_total = unit_price * qty),
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or (void_reason is not null and btrim(void_reason) <> ''))
);
create index order_items_order on order_items (order_id);
create index order_items_tab on order_items (tab_id);
create index order_items_menu_item on order_items (menu_item_id);

create table order_item_modifiers (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  order_item_id uuid not null references order_items (id),
  modifier_id   uuid not null references modifiers (id),
  name_en       text not null,
  name_ar       text not null,
  price_delta   iqd_signed not null,
  created_at    timestamptz not null default now()
);
create index order_item_modifiers_item on order_item_modifiers (order_item_id);

-- ---------------------------------------------------------------------------
-- RLS: select-only for active staff of the venue. No client writes.
-- ---------------------------------------------------------------------------
do $rls_0009$
declare
  t text;
begin
  foreach t in array array['day_sessions', 'tabs', 'orders', 'order_items', 'order_item_modifiers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null)',
      t || '_staff_read', t);
  end loop;
end $rls_0009$;
