-- 0004 venues, venue settings, staff, and the helpers every later function and
-- policy uses: app.current_venue(), app.staff_role(), app.is_staff(...),
-- app.business_date(...).

-- ---------------------------------------------------------------------------
-- venues: one restaurant location. v1 runs one; the schema is ready for more.
-- ---------------------------------------------------------------------------
create table venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  timezone   text not null default 'Asia/Baghdad',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- app.current_venue(): the caller's venue. An active staff member's own venue;
-- otherwise (service role, seeds, tests) the only venue when exactly one exists;
-- otherwise NULL, so a venue-less insert fails its NOT NULL instead of guessing.
-- plpgsql so its body (which reads `staff`, created below) is not validated now.
-- Used as the default of every venue_id column and inside every select policy.
-- ---------------------------------------------------------------------------
create or replace function app.current_venue() returns uuid
language plpgsql stable security definer set search_path = public as $current_venue$
declare
  v_venue uuid;
begin
  select s.venue_id into v_venue from staff s where s.id = auth.uid() and s.is_active;
  if v_venue is null then
    select v.id into v_venue from venues v where (select count(*) from venues) = 1;
  end if;
  return v_venue;
end $current_venue$;

revoke all on function app.current_venue() from public, anon, authenticated;
-- Column defaults and policies run as the writing/reading role.
grant execute on function app.current_venue() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- venue_settings: one row per venue.
-- ---------------------------------------------------------------------------
create table venue_settings (
  venue_id           uuid primary key default app.current_venue() references venues (id),
  currency           text not null default 'IQD' check (currency = 'IQD'),
  receipt_header_en  text not null default '',
  receipt_header_ar  text not null default '',
  receipt_footer_en  text not null default '',
  receipt_footer_ar  text not null default '',
  service_charge_bps int  not null default 0 check (service_charge_bps between 0 and 10000),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff: one row per staff auth user. The role source of truth (no JWT claims),
-- so a role change takes effect on the next statement.
-- ---------------------------------------------------------------------------
create table staff (
  id         uuid primary key references auth.users (id) on delete restrict,
  venue_id   uuid not null default app.current_venue() references venues (id),
  full_name  text not null check (btrim(full_name) <> ''),
  role       staff_role not null,
  pin_hash   text,                       -- extensions.crypt(pin, gen_salt('bf')); never readable by clients
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index staff_venue on staff (venue_id);

-- ---------------------------------------------------------------------------
-- app.staff_role(): the caller's role, NULL when not active staff.
-- app.is_staff(roles...): coalesced to FALSE, never NULL, so a guard written
-- `if not app.is_staff(...)` can never let a non-staff caller fall through.
-- ---------------------------------------------------------------------------
create or replace function app.staff_role() returns staff_role
language sql stable security definer set search_path = public as $staff_role$
  select s.role from staff s where s.id = auth.uid() and s.is_active
$staff_role$;

create or replace function app.is_staff(variadic p_roles staff_role[]) returns boolean
language sql stable security definer set search_path = public as $is_staff$
  select coalesce(app.staff_role() = any (p_roles), false)
$is_staff$;

revoke all on function app.staff_role() from public, anon, authenticated;
revoke all on function app.is_staff(variadic staff_role[]) from public, anon, authenticated;
-- Read inside RLS policies, which run as the reading role.
grant execute on function app.staff_role() to authenticated;
grant execute on function app.is_staff(variadic staff_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- app.business_date(at): the calendar date of an instant in the venue's time
-- zone (Asia/Baghdad), never the UTC date. Internal: called by definer bodies.
-- ---------------------------------------------------------------------------
create or replace function app.business_date(p_at timestamptz default now()) returns date
language sql stable security definer set search_path = public as $business_date$
  select (p_at at time zone coalesce(
            (select v.timezone from venues v where v.id = app.current_venue()),
            'Asia/Baghdad'))::date
$business_date$;

revoke all on function app.business_date(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: select-only, staff of the venue. No client writes.
-- ---------------------------------------------------------------------------
alter table venues enable row level security;
alter table venue_settings enable row level security;
alter table staff enable row level security;

revoke all on venues, venue_settings, staff from anon, authenticated;

grant select on venues, venue_settings to authenticated;
-- staff: column grant, so pin_hash is never readable by a client.
grant select (id, venue_id, full_name, role, is_active, created_at) on staff to authenticated;

create policy venues_staff_read on venues for select to authenticated
  using (id = (select app.current_venue()) and (select app.staff_role()) is not null);
create policy venue_settings_staff_read on venue_settings for select to authenticated
  using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null);
create policy staff_staff_read on staff for select to authenticated
  using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null);
