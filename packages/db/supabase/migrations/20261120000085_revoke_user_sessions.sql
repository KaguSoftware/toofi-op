-- 0085 app.revoke_user_sessions(user) -> number of sessions ended. SERVICE ROLE
-- ONLY: the staff-admin edge function calls it after a password reset, so the
-- person's existing logins stop working. GoTrue's admin API can only sign out a
-- session it is handed the JWT of, so the sessions are deleted here; their
-- refresh tokens go with them (on delete cascade), and an access token already
-- issued lapses at its expiry.
create or replace function app.revoke_user_sessions(p_user_id uuid) returns int
language plpgsql security definer set search_path = public as $revoke_user_sessions$
declare
  v_n int;
begin
  delete from auth.sessions s where s.user_id = p_user_id;
  get diagnostics v_n = row_count;
  return v_n;
end $revoke_user_sessions$;

revoke all on function app.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function app.revoke_user_sessions(uuid) to service_role;
