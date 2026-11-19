-- 0080 PIN hardening (review fixes).
--
-- 1. Parallel requests no longer slip past the lockout. Both verify functions
--    take pg_advisory_xact_lock(hashtext(actor)) before reading the lockout, so
--    one caller's attempts are checked one at a time: the 6th parallel guess
--    sees the 5 failures before it and answers PIN_LOCKED without a crypt.
--
-- 2. A grant may be bound to the row it authorizes. verify_manager_pin takes an
--    optional p_entity_id; consume_pin_grant(action, entity) spends a grant whose
--    entity is that row, else an unbound (NULL entity) grant, never a grant bound
--    to another row. Unbound grants keep working, so callers that do not pass an
--    entity are unchanged. The entity each gated function passes:
--      void_item -> order_items.id     cancel_tab -> tabs.id
--      discount  -> tabs.id            refund     -> payments.id
--      close_till_shift -> till_shifts.id
--
-- Signature changes: verify_manager_pin(text, text) -> (text, text, uuid default null);
-- consume_pin_grant(text) -> (text, uuid default null).

alter table app.pin_grants add column entity_id uuid;

drop function app.verify_manager_pin(text, text);
drop function app.consume_pin_grant(text);

-- ---------------------------------------------------------------------------
-- app.verify_manager_pin(pin, action, entity?) -> {ok: true, authorized_by}
--                                             | {ok: false, code: PIN_INVALID | PIN_LOCKED}
-- ---------------------------------------------------------------------------
create function app.verify_manager_pin(p_pin text, p_action text, p_entity_id uuid default null) returns jsonb
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

  -- One attempt at a time per caller, held to commit, so the count below is exact.
  perform pg_advisory_xact_lock(hashtext('pin:' || v_actor::text));

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
    insert into app.pin_grants (actor_id, authorizer_id, action, entity_id)
    values (v_actor, v_auth, p_action, p_entity_id);
    -- Housekeeping, bounded: this caller's old grants.
    delete from app.pin_grants
     where actor_id = v_actor and created_at < now() - interval '1 hour';
  end if;

  return app.pin_answer(v_actor, v_auth is not null,
                        jsonb_build_object('authorized_by', v_auth));
end $verify_manager_pin$;

-- ---------------------------------------------------------------------------
-- app.consume_pin_grant(action, entity?) -> authorizer staff id. INTERNAL.
-- Spends, exactly once, the caller's live grant for that action: one bound to
-- p_entity_id first, else an unbound one (newest first). PIN_GRANT_REQUIRED
-- when there is none.
-- ---------------------------------------------------------------------------
create function app.consume_pin_grant(p_action text, p_entity_id uuid default null) returns uuid
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
        and (pg.entity_id is null or pg.entity_id = p_entity_id)
        and pg.consumed_at is null
        and pg.expires_at > now()
      order by (pg.entity_id is not null) desc, pg.created_at desc
      limit 1
      for update skip locked)
  returning g.authorizer_id into v_auth;

  if v_auth is null then
    raise exception 'PIN_GRANT_REQUIRED' using errcode = 'P0001';
  end if;
  return v_auth;
end $consume_pin_grant$;

-- ---------------------------------------------------------------------------
-- app.verify_own_pin(pin): unchanged but for the per-caller lock.
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

  perform pg_advisory_xact_lock(hashtext('pin:' || v_actor::text));

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

revoke all on function app.verify_manager_pin(text, text, uuid) from public, anon, authenticated;
revoke all on function app.consume_pin_grant(text, uuid) from public, anon, authenticated;
revoke all on function app.verify_own_pin(text) from public, anon, authenticated;
grant execute on function app.verify_manager_pin(text, text, uuid) to authenticated;
grant execute on function app.verify_own_pin(text) to authenticated;
