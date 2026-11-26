-- 0141 guest QR menu: tables. Contract: .scratch/qr-menu/spec.md, "Database (step 1)".
--
--   venue_settings   gains guest_calls_enabled and guest_orders_enabled (the venue's
--                    two off switches).
--   table_links      one per dining table (insert trigger + backfill): the QR code's
--                    stored random token (16 bytes, base64url, 22 characters) and the
--                    table's own switch. Staff read every column EXCEPT token (column
--                    grant, as staff.pin_hash); tokens leave only through
--                    app.table_qr_tokens().
--   app.guest_sessions  a guest's login-free access to one table. The id is the
--                    bearer credential. No client grants at all, as app.pin_grants.
--   waiter_calls     a guest's call; one open call per table per business day.
--   guest_orders     a guest's basket, held as a request until staff accept or
--                    decline it. Nothing reaches tabs, orders or stock before accept.
--
-- Guest functions run as SECURITY DEFINER with auth.uid() NULL, so they write
-- venue_id explicitly from the table's row; the column default is for staff paths.
-- Lock order gains guest_orders and waiter_calls right after day_sessions:
--   day_sessions -> guest_orders -> waiter_calls -> tabs -> orders -> ...

alter table venue_settings add column guest_calls_enabled  boolean not null default true;
alter table venue_settings add column guest_orders_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- app.new_table_token(): 16 random bytes as unpadded base64url (22 characters).
-- Internal.
-- ---------------------------------------------------------------------------
create or replace function app.new_table_token() returns text
language sql volatile set search_path = public as $new_table_token$
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_')
$new_table_token$;

revoke all on function app.new_table_token() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- table_links
-- ---------------------------------------------------------------------------
create table table_links (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  table_id      uuid not null unique references dining_tables (id) on delete cascade,
  token         text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  guest_enabled boolean not null default true,
  rotated_at    timestamptz,                 -- NULL: never replaced
  created_at    timestamptz not null default now()
);

-- Every new dining table gets its link, whoever inserts it.
create or replace function app.table_link_on_insert() returns trigger
language plpgsql security definer set search_path = public as $table_link_on_insert$
begin
  insert into table_links (venue_id, table_id, token)
  values (new.venue_id, new.id, app.new_table_token());
  return null;
end $table_link_on_insert$;

revoke all on function app.table_link_on_insert() from public, anon, authenticated;

create trigger dining_tables_link
  after insert on dining_tables
  for each row execute function app.table_link_on_insert();

-- Backfill the tables that exist already.
insert into table_links (venue_id, table_id, token)
select t.venue_id, t.id, app.new_table_token()
  from dining_tables t
 where not exists (select 1 from table_links l where l.table_id = t.id);

-- ---------------------------------------------------------------------------
-- app.guest_sessions
-- ---------------------------------------------------------------------------
create table app.guest_sessions (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null default app.current_venue() references venues (id),
  table_id         uuid not null references dining_tables (id) on delete cascade,
  last_activity_at timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '90 minutes',
  closed_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index guest_sessions_table_created on app.guest_sessions (table_id, created_at);
create index guest_sessions_live on app.guest_sessions (table_id) where closed_at is null;

alter table app.guest_sessions enable row level security;  -- no policy, no client grant
revoke all on app.guest_sessions from public, anon, authenticated;
grant all on app.guest_sessions to service_role;

-- ---------------------------------------------------------------------------
-- waiter_calls
-- ---------------------------------------------------------------------------
create table waiter_calls (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null default app.current_venue() references venues (id),
  table_id         uuid not null references dining_tables (id),
  day_session_id   uuid not null references day_sessions (id),
  guest_session_id uuid references app.guest_sessions (id) on delete set null,
  reason           waiter_call_reason not null,
  called_at        timestamptz not null default now(),
  answered_at      timestamptz,
  answered_by      uuid references staff (id),
  idempotency_key  text not null check (btrim(idempotency_key) <> ''),
  created_at       timestamptz not null default now(),
  check ((answered_at is null) = (answered_by is null)),
  constraint waiter_calls_session_key unique (guest_session_id, idempotency_key)
);
-- One open call per table per business day.
create unique index waiter_calls_one_open on waiter_calls (table_id, day_session_id) where answered_at is null;
create index waiter_calls_table_day on waiter_calls (table_id, day_session_id, called_at desc);
create index waiter_calls_day_open on waiter_calls (day_session_id) where answered_at is null;

-- ---------------------------------------------------------------------------
-- guest_orders
-- items: the cleaned request, add_items' input shape [{menu_item_id, qty, modifier_ids[], note}].
-- quote: the server-priced lines at send time, for display only.
-- ---------------------------------------------------------------------------
create table guest_orders (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null default app.current_venue() references venues (id),
  table_id         uuid not null references dining_tables (id),
  day_session_id   uuid not null references day_sessions (id),
  guest_session_id uuid references app.guest_sessions (id) on delete set null,
  status           guest_order_status not null default 'pending',
  items            jsonb not null check (jsonb_typeof(items) = 'array'),
  quote            jsonb not null check (jsonb_typeof(quote) = 'array'),
  quoted_total     iqd  not null,
  sent_at          timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid references staff (id),
  tab_id           uuid references tabs (id),
  order_id         uuid references orders (id),
  idempotency_key  text not null check (btrim(idempotency_key) <> ''),
  created_at       timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check ((decided_at is null) = (decided_by is null)),
  check ((status = 'accepted') = (order_id is not null and tab_id is not null)),
  constraint guest_orders_session_key unique (guest_session_id, idempotency_key)
);
create index guest_orders_table_day_pending on guest_orders (table_id, day_session_id) where status = 'pending';
create index guest_orders_day_pending on guest_orders (day_session_id) where status = 'pending';
create index guest_orders_session on guest_orders (guest_session_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- RLS: select-only for active staff of the venue. No client writes.
-- table_links: a column grant leaves token out.
-- ---------------------------------------------------------------------------
do $rls_0141$
declare
  t text;
begin
  foreach t in array array['table_links', 'waiter_calls', 'guest_orders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null)',
      t || '_staff_read', t);
  end loop;
end $rls_0141$;

grant select (id, venue_id, table_id, guest_enabled, rotated_at, created_at) on table_links to authenticated;
grant select on waiter_calls, guest_orders to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the existing refetch signal on tabs:<venue>. No new topic or policy.
-- ---------------------------------------------------------------------------
create trigger waiter_calls_rt after insert or update on waiter_calls
  for each row execute function app.rt_signal('tabs');
create trigger guest_orders_rt after insert or update on guest_orders
  for each row execute function app.rt_signal('tabs');
