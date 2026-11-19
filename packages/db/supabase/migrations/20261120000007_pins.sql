-- 0007 PINs: attempts, lockout, manager-PIN grants, own PIN.
--
-- THE GRANT PATTERN (CLAUDE.md rule 7). A raise aborts the transaction, and with
-- it the attempt row the lockout counts. So a PIN is never checked inside a money
-- function. Instead:
--   1. The client calls app.verify_manager_pin(pin, action) on its own. It always
--      RETURNS (never raises once the PIN is being checked), so the attempt row
--      commits whatever the outcome. On success it writes one short-lived grant.
--   2. The money function calls app.consume_pin_grant(action), which spends the
--      caller's newest live grant for that action and returns the authorizer's
--      staff id, or raises PIN_GRANT_REQUIRED.
-- When the actor is a manager or owner, the money function records them as the
-- authorizer and does not consume a grant:
--   v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
--                  else app.consume_pin_grant('<action>') end;
--
-- LOCKOUT. 5 failed attempts within 5 minutes lock the CALLER (auth.uid()) out of
-- both verify functions until the window clears. Keyed on the caller, not on any
-- client-supplied device id, so rotating ids buys no extra guesses.
--
-- PIN FORMAT. 6 to 12 digits, never a repeated digit or a straight run
-- (app.pin_is_weak). Enforced when a PIN is set.

create table app.pin_attempts (
  id       bigint generated always as identity primary key,
  actor_id uuid not null,              -- auth.uid() of the caller who typed the PIN
  ok       boolean not null,
  at       timestamptz not null default now()
);
create index pin_attempts_actor_at on app.pin_attempts (actor_id, at desc);

create table app.pin_grants (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null,                         -- auth.uid() that typed the PIN
  authorizer_id uuid not null references staff (id),   -- the manager whose PIN it was
  action        text not null,                         -- e.g. 'void_line', 'discount'
  expires_at    timestamptz not null default now() + interval '2 minutes',
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index pin_grants_live on app.pin_grants (actor_id, action) where consumed_at is null;

alter table app.pin_attempts enable row level security;  -- no policy, no client grant
alter table app.pin_grants enable row level security;
revoke all on app.pin_attempts, app.pin_grants from public, anon, authenticated;
grant all on app.pin_attempts, app.pin_grants to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers.
-- ---------------------------------------------------------------------------

-- True for the shapes people pick: one repeated digit, or an ascending or
-- descending run (123456, 987654, 567890).
create or replace function app.pin_is_weak(p_pin text) returns boolean
language sql immutable set search_path = public as $pin_is_weak$
  select p_pin ~ '^([0-9])\1*$'
      or position(p_pin in '01234567890') > 0
      or position(p_pin in '09876543210') > 0
$pin_is_weak$;

-- True when the actor has 5 or more failed attempts in the last 5 minutes.
create or replace function app.pin_locked(p_actor uuid) returns boolean
language sql stable security definer set search_path = public as $pin_locked$
  select count(*) >= 5
    from app.pin_attempts a
   where a.actor_id = p_actor
     and not a.ok
     and a.at > now() - interval '5 minutes'
$pin_locked$;

-- Record one attempt and answer it. Always returns: this is the committed path.
create or replace function app.pin_answer(p_actor uuid, p_ok boolean, p_extra jsonb default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $pin_answer$
begin
  insert into app.pin_attempts (actor_id, ok) values (p_actor, p_ok);
  if p_ok then
    return jsonb_build_object('ok', true) || p_extra;
  end if;
  if app.pin_locked(p_actor) then
    -- Audited here, on the failure that reached the threshold, because this path commits.
    if (select count(*) from app.pin_attempts a
         where a.actor_id = p_actor and not a.ok and a.at > now() - interval '5 minutes') = 5 then
      perform app.write_audit('staff.pin_locked', 'staff', p_actor);
    end if;
    return jsonb_build_object('ok', false, 'code', 'PIN_LOCKED');
  end if;
  return jsonb_build_object('ok', false, 'code', 'PIN_INVALID');
end $pin_answer$;

revoke all on function app.pin_is_weak(text) from public, anon, authenticated;
revoke all on function app.pin_locked(uuid) from public, anon, authenticated;
revoke all on function app.pin_answer(uuid, boolean, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.verify_manager_pin(pin, action) -> {ok: true, authorized_by}
--                                      | {ok: false, code: PIN_INVALID | PIN_LOCKED}
-- Any active staff may call it. On success it writes a grant for `action` that
-- app.consume_pin_grant(action) can spend once within 2 minutes.
-- ---------------------------------------------------------------------------
create or replace function app.verify_manager_pin(p_pin text, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $verify_manager_pin$
declare
  v_actor uuid := auth.uid();
  v_auth  uuid;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'PIN_ACTION_REQUIRED' using errcode = 'P0001';
  end if;

  -- From here on: never raise.
  if app.pin_locked(v_actor) then
    return jsonb_build_object('ok', false, 'code', 'PIN_LOCKED');
  end if;

  if p_pin ~ '^[0-9]{6,12}$' then
    -- On a PIN shared by two managers the lowest id is credited: stable, not
    -- necessarily right. PIN uniqueness cannot be enforced without leaking PINs.
    select s.id into v_auth
      from staff s
     where s.venue_id = app.current_venue()
       and s.role in ('manager', 'owner')
       and s.is_active
       and s.pin_hash is not null
       and s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
     order by s.id
     limit 1;
  end if;

  if v_auth is not null then
    insert into app.pin_grants (actor_id, authorizer_id, action)
    values (v_actor, v_auth, p_action);
    -- Housekeeping, bounded: this caller's old grants.
    delete from app.pin_grants
     where actor_id = v_actor and created_at < now() - interval '1 hour';
  end if;

  return app.pin_answer(v_actor, v_auth is not null,
                        jsonb_build_object('authorized_by', v_auth));
end $verify_manager_pin$;

-- ---------------------------------------------------------------------------
-- app.consume_pin_grant(action) -> authorizer staff id. INTERNAL: called only by
-- money functions (no client grant). Spends the caller's newest live grant for
-- that action, exactly once; PIN_GRANT_REQUIRED when there is none.
-- ---------------------------------------------------------------------------
create or replace function app.consume_pin_grant(p_action text) returns uuid
language plpgsql security definer set search_path = public as $consume_pin_grant$
declare
  v_auth uuid;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update app.pin_grants g
     set consumed_at = now()
   where g.id = (
     select pg.id
       from app.pin_grants pg
      where pg.actor_id = auth.uid()
        and pg.action = p_action
        and pg.consumed_at is null
        and pg.expires_at > now()
      order by pg.created_at desc
      limit 1
      for update skip locked)
  returning g.authorizer_id into v_auth;

  if v_auth is null then
    raise exception 'PIN_GRANT_REQUIRED' using errcode = 'P0001';
  end if;
  return v_auth;
end $consume_pin_grant$;

-- ---------------------------------------------------------------------------
-- app.verify_own_pin(pin) -> {ok: true} | {ok: false, code: PIN_INVALID |
-- PIN_LOCKED | PIN_NOT_SET}. The caller's own PIN (e.g. unlocking a station).
-- Shares the lockout with verify_manager_pin.
-- ---------------------------------------------------------------------------
create or replace function app.verify_own_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $verify_own_pin$
declare
  v_actor uuid := auth.uid();
  v_hash  text;
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- From here on: never raise.
  if app.pin_locked(v_actor) then
    return jsonb_build_object('ok', false, 'code', 'PIN_LOCKED');
  end if;

  select s.pin_hash into v_hash from staff s where s.id = v_actor;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'code', 'PIN_NOT_SET');
  end if;

  return app.pin_answer(v_actor,
                        coalesce(p_pin ~ '^[0-9]{6,12}$' and v_hash = extensions.crypt(p_pin, v_hash), false));
end $verify_own_pin$;

-- ---------------------------------------------------------------------------
-- app.set_own_pin(pin): any active staff sets their own PIN. Refuses a malformed
-- (PIN_FORMAT) or guessable (PIN_WEAK) PIN. Audits the change, never the PIN.
-- Setting another person's PIN is owner staff admin (catalog phase).
-- ---------------------------------------------------------------------------
create or replace function app.set_own_pin(p_pin text) returns void
language plpgsql security definer set search_path = public as $set_own_pin$
begin
  if app.staff_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then
    raise exception 'PIN_FORMAT' using errcode = 'P0001';
  end if;
  if app.pin_is_weak(p_pin) then
    raise exception 'PIN_WEAK' using errcode = 'P0001';
  end if;

  update staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = auth.uid();

  perform app.write_audit('staff.pin_set', 'staff', auth.uid());
end $set_own_pin$;

revoke all on function app.verify_manager_pin(text, text) from public, anon, authenticated;
revoke all on function app.consume_pin_grant(text) from public, anon, authenticated;
revoke all on function app.verify_own_pin(text) from public, anon, authenticated;
revoke all on function app.set_own_pin(text) from public, anon, authenticated;

grant execute on function app.verify_manager_pin(text, text) to authenticated;
grant execute on function app.verify_own_pin(text) to authenticated;
grant execute on function app.set_own_pin(text) to authenticated;
