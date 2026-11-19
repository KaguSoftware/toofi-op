-- 0123 housekeeping: app.purge_housekeeping(), scheduled nightly with pg_cron.
--
-- app.purge_housekeeping() -> {rpc_replays, pin_attempts, pin_grants} (rows deleted)
--   app.rpc_replays   created more than 7 days ago (a retry older than that is
--                     no longer a retry);
--   app.pin_attempts  more than 1 day ago (the lockout window is 5 minutes);
--   app.pin_grants    expired more than 1 day ago (a grant lives 2 minutes).
-- audit_log is NEVER purged (append-only, CLAUDE.md rule 4).
--
-- Service role only: no grant to anon or authenticated. It is SECURITY INVOKER,
-- so the caller's own table privileges are the guard too: only service_role and
-- postgres (pg_cron) can delete from these app tables.
--
-- Scheduling: pg_cron ships with the Supabase image, so this migration enables
-- it and schedules the job 'rop-purge-housekeeping' at 00:30 UTC (03:30
-- Baghdad) every night. cron.schedule upserts by job name, so re-running is
-- safe. On a hosted project where pg_cron cannot be enabled by a migration,
-- enable it under Database > Extensions, then run once in the SQL editor:
--   select cron.schedule('rop-purge-housekeeping', '30 0 * * *', 'select app.purge_housekeeping()');

create or replace function app.purge_housekeeping() returns jsonb
language plpgsql security invoker set search_path = public as $purge_housekeeping$
declare
  v_replays  int;
  v_attempts int;
  v_grants   int;
begin
  delete from app.rpc_replays where created_at < now() - interval '7 days';
  get diagnostics v_replays = row_count;
  delete from app.pin_attempts where at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from app.pin_grants where expires_at < now() - interval '1 day';
  get diagnostics v_grants = row_count;
  return jsonb_build_object('rpc_replays', v_replays, 'pin_attempts', v_attempts, 'pin_grants', v_grants);
end $purge_housekeeping$;

revoke all on function app.purge_housekeeping() from public, anon, authenticated;
grant execute on function app.purge_housekeeping() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('rop-purge-housekeeping', '30 0 * * *', 'select app.purge_housekeeping()');
