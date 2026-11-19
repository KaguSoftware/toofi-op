-- 0006 idempotency: app.rpc_replays, app.claim_replay(key), app.finish_replay(key, result).
--
-- Pattern for every write that creates a row or moves money (CLAUDE.md rule 5):
--
--   v_replay := app.claim_replay(p_idempotency_key);   -- after the role guard
--   if v_replay is not null then return v_replay; end if;
--   ... do the work ...
--   return app.finish_replay(p_idempotency_key, v_result);
--
-- The claim is inserted in the caller's transaction, BEFORE the work, so it
-- commits with the work or rolls back with it: there is no window where money
-- moved and the claim did not. A concurrent second call with the same key waits
-- on the first one's claim row, then reads its stored result.
--
-- Keys are caller-scoped: another principal presenting your key gets
-- IDEMPOTENCY_CONFLICT, never your result. Functions using this return jsonb.

create table app.rpc_replays (
  key        text primary key,
  actor_id   uuid,
  result     jsonb,
  created_at timestamptz not null default now()
);

alter table app.rpc_replays enable row level security;  -- no policy, no client grant
revoke all on app.rpc_replays from public, anon, authenticated;
grant all on app.rpc_replays to service_role;

-- NULL: a fresh claim, the caller must do the work. Otherwise the stored result.
create or replace function app.claim_replay(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $claim_replay$
declare
  v_row app.rpc_replays%rowtype;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  insert into app.rpc_replays (key, actor_id) values (p_key, auth.uid())
  on conflict (key) do nothing;
  if found then
    return null;
  end if;

  select * into v_row from app.rpc_replays where key = p_key;
  if v_row.actor_id is distinct from auth.uid() then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  -- '{}' when a body forgot finish_replay: never NULL, or the replay would redo the work.
  return coalesce(v_row.result, '{}'::jsonb);
end $claim_replay$;

-- Store the fresh call's result for later replays, and hand it back.
create or replace function app.finish_replay(p_key text, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public as $finish_replay$
begin
  update app.rpc_replays set result = p_result where key = p_key;
  return p_result;
end $finish_replay$;

revoke all on function app.claim_replay(text) from public, anon, authenticated;
revoke all on function app.finish_replay(text, jsonb) from public, anon, authenticated;
