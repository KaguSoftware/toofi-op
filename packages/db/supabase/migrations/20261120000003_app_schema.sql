-- 0003 the `app` schema, the default-privilege posture, and the append-only guard.
--
-- Posture (CLAUDE.md backend rules 1 and 12): tables live in `public` with
-- select-only RLS policies; every write is an `app.*` SECURITY DEFINER function.
-- Client roles get NO automatic privileges: each migration grants exactly what it
-- means to. service_role keeps Supabase's standard grants on tables (server-side
-- only; it bypasses RLS) except where a migration revokes them (append-only).

create schema if not exists app;

grant usage on schema app to anon, authenticated, service_role;

-- New objects carry no client grants, whichever role applies the migrations
-- (the CLI applies them as `postgres`; the bare form covers the current role).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app
  revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public, anon, authenticated;

-- service_role (seeds, tests, server tooling) may use app tables; never clients.
alter default privileges in schema app grant all on tables to service_role;
alter default privileges in schema app grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- app.forbid_mutation: the second wall of append-only tables (the first is that
-- no role holds UPDATE/DELETE on them). Attached as a statement-level BEFORE
-- UPDATE OR DELETE OR TRUNCATE trigger, so it fires for every role, superusers
-- and table owners included. A correction is always a new row.
-- ---------------------------------------------------------------------------
create or replace function app.forbid_mutation() returns trigger
language plpgsql as $forbid_mutation$
begin
  raise exception 'APPEND_ONLY' using errcode = 'P0001', detail = tg_table_name;
end $forbid_mutation$;

revoke all on function app.forbid_mutation() from public, anon, authenticated;
