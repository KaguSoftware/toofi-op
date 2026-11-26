-- 0144 housekeeping for the guest QR menu: app.purge_housekeeping() as 0123, plus
-- app.guest_sessions that expired or closed more than one day ago (a session lives
-- 90 minutes from its last activity). waiter_calls and guest_orders keep their
-- rows; their guest_session_id is set to NULL by the foreign key.
--
-- app.purge_housekeeping() -> {rpc_replays, pin_attempts, pin_grants, guest_sessions}
-- Service role only, SECURITY INVOKER (unchanged). The pg_cron job from 0123 calls
-- it by name, so it needs no new schedule.

create or replace function app.purge_housekeeping() returns jsonb
language plpgsql security invoker set search_path = public as $purge_housekeeping$
declare
  v_replays  int;
  v_attempts int;
  v_grants   int;
  v_sessions int;
begin
  delete from app.rpc_replays where created_at < now() - interval '7 days';
  get diagnostics v_replays = row_count;
  delete from app.pin_attempts where at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from app.pin_grants where expires_at < now() - interval '1 day';
  get diagnostics v_grants = row_count;
  delete from app.guest_sessions
   where expires_at < now() - interval '1 day' or closed_at < now() - interval '1 day';
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('rpc_replays', v_replays, 'pin_attempts', v_attempts, 'pin_grants', v_grants,
                            'guest_sessions', v_sessions);
end $purge_housekeeping$;

revoke all on function app.purge_housekeeping() from public, anon, authenticated;
grant execute on function app.purge_housekeeping() to service_role;
