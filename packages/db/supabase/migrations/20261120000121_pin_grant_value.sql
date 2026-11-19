-- 0121 a manager PIN grant may be bound to the value it authorizes.
--
-- 0080 bound a grant to the action and the row. A cashier holding a manager's
-- "discount this tab" grant could still discount any amount. Now
-- verify_manager_pin takes an optional p_value, and consume_pin_grant spends a
-- grant whose value is NULL (unbound) or equals the value the call uses, never
-- one bound to another value. Values passed by the gated functions:
--   apply_discount -> p_value (basis points for a percent, IQD for an amount)
--   refund         -> p_amount (IQD)
-- void_item, cancel_tab and close_till_shift_for pass none, so only unbound-value
-- grants serve them.
--
-- A failed gated call: consume_pin_grant runs in the gated call's transaction,
-- so a call that raises after consuming rolls the grant back to unconsumed. It
-- is still bound to the value (and row) it was verified for, so it can never
-- authorize a different value. Grants without a value behave as before.
--
-- Signature changes (both backward compatible, the new argument defaults to NULL):
--   verify_manager_pin(text, text, uuid) -> (p_pin text, p_action text,
--                                           p_entity_id uuid default null,
--                                           p_value bigint default null)
--   consume_pin_grant(text, uuid)        -> (text, uuid default null, bigint default null)

alter table app.pin_grants add column value bigint;

drop function app.verify_manager_pin(text, text, uuid);
drop function app.consume_pin_grant(text, uuid);

-- ---------------------------------------------------------------------------
-- app.verify_manager_pin(pin, action, entity?, value?) -> {ok: true, authorized_by}
--                                   | {ok: false, code: PIN_INVALID | PIN_LOCKED}
-- As 0080, plus the value binding.
-- ---------------------------------------------------------------------------
create function app.verify_manager_pin(
  p_pin       text,
  p_action    text,
  p_entity_id uuid default null,
  p_value     bigint default null
) returns jsonb
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
    insert into app.pin_grants (actor_id, authorizer_id, action, entity_id, value)
    values (v_actor, v_auth, p_action, p_entity_id, p_value);
    -- Housekeeping, bounded: this caller's old grants.
    delete from app.pin_grants
     where actor_id = v_actor and created_at < now() - interval '1 hour';
  end if;

  return app.pin_answer(v_actor, v_auth is not null,
                        jsonb_build_object('authorized_by', v_auth));
end $verify_manager_pin$;

-- ---------------------------------------------------------------------------
-- app.consume_pin_grant(action, entity?, value?) -> authorizer staff id. INTERNAL.
-- Spends, exactly once, the caller's live grant for that action whose entity is
-- NULL or p_entity_id and whose value is NULL or p_value; the most specific
-- first (bound entity, then bound value), then newest. PIN_GRANT_REQUIRED when
-- there is none.
-- ---------------------------------------------------------------------------
create function app.consume_pin_grant(
  p_action    text,
  p_entity_id uuid default null,
  p_value     bigint default null
) returns uuid
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
        and (pg.value is null or pg.value = p_value)
        and pg.consumed_at is null
        and pg.expires_at > now()
      order by (pg.entity_id is not null) desc, (pg.value is not null) desc, pg.created_at desc
      limit 1
      for update skip locked)
  returning g.authorizer_id into v_auth;

  if v_auth is null then
    raise exception 'PIN_GRANT_REQUIRED' using errcode = 'P0001';
  end if;
  return v_auth;
end $consume_pin_grant$;

revoke all on function app.verify_manager_pin(text, text, uuid, bigint) from public, anon, authenticated;
revoke all on function app.consume_pin_grant(text, uuid, bigint) from public, anon, authenticated;
grant execute on function app.verify_manager_pin(text, text, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_discount and refund: bodies as 0082 / 0083, but the grant they consume
-- must match their value.
-- ---------------------------------------------------------------------------
create or replace function app.apply_discount(
  p_tab_id          uuid,
  p_kind            adjustment_kind,
  p_value           bigint,
  p_reason          text,
  p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public as $apply_discount$
declare
  v_replay jsonb;
  v_tab    tabs%rowtype;
  v_tot    jsonb;
  v_amount bigint;
  v_auth   uuid;
  v_adj    tab_adjustments%rowtype;
  v_totals jsonb;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_kind is null or p_value is null or p_value <= 0
     or (p_kind = 'discount_percent' and p_value > 10000) then
    raise exception 'INVALID_DISCOUNT' using errcode = 'P0001';
  end if;

  v_tab := app.lock_open_tab(p_tab_id);
  v_tot := app.compute_tab_totals(v_tab.id);
  v_amount := case when p_kind = 'discount_percent'
                   then app.round_div((v_tot ->> 'subtotal')::bigint * p_value, 10000)
                   else p_value end;
  v_amount := least(v_amount, (v_tot ->> 'subtotal')::bigint - (v_tot ->> 'discount')::bigint);
  if v_amount <= 0 then
    raise exception 'NOTHING_TO_DISCOUNT' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('discount', v_tab.id, p_value) end;
  insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by, authorized_by)
  values (v_tab.id, p_kind, p_value, v_amount, btrim(p_reason), auth.uid(), v_auth)
  returning * into v_adj;

  v_totals := app.tab_after_change(v_tab.id);
  perform app.write_audit('tab.discount', 'tab_adjustments', v_adj.id, null, to_jsonb(v_adj), p_reason, v_auth);
  return app.finish_replay(p_idempotency_key,
    jsonb_build_object('adjustment_id', v_adj.id, 'amount', v_amount, 'totals', v_totals));
end $apply_discount$;

create or replace function app.refund(
  p_payment_id      uuid,
  p_amount          bigint,
  p_reason          text,
  p_device_id       text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $refund$
declare
  v_replay jsonb;
  v_day    uuid;
  v_pay    payments%rowtype;
  v_tab    tabs%rowtype;
  v_left   bigint;
  v_auth   uuid;
  v_ref    refunds%rowtype;
begin
  if not app.is_staff('cashier', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'DEVICE_REQUIRED' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions first. FOR SHARE: close_day waits for this refund.
  select d.id into v_day from day_sessions d
   where d.venue_id = app.current_venue() and d.closed_at is null
   for share;
  if v_day is null then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;

  select * into v_pay from payments p where p.id = p_payment_id and p.venue_id = app.current_venue();
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- The tab serialises refunds of its payments.
  select * into v_tab from tabs t where t.id = v_pay.tab_id for update;
  if v_tab.status <> 'settled' then
    raise exception 'TAB_NOT_SETTLED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  v_left := v_pay.amount - coalesce((select sum(r.amount) from refunds r where r.payment_id = v_pay.id), 0);
  if p_amount > v_left then
    raise exception 'OVER_REFUND' using errcode = 'P0001';
  end if;

  v_auth := case when app.is_staff('manager', 'owner') then auth.uid()
                 else app.consume_pin_grant('refund', v_pay.id, p_amount) end;
  insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by, authorized_by,
                       device_id, day_session_id)
  values (v_pay.id, v_tab.id, p_amount, v_pay.method, btrim(p_reason), auth.uid(), v_auth,
          btrim(p_device_id), v_day)
  returning * into v_ref;

  perform app.write_audit('payment.refund', 'refunds', v_ref.id, null, to_jsonb(v_ref), p_reason, v_auth);
  perform app.audit_shift_mismatch('refund.shift_mismatch', 'refunds', v_ref.id, v_ref.method,
                                   v_ref.till_shift_id, v_ref.device_id);
  return app.finish_replay(p_idempotency_key, jsonb_build_object(
    'refund_id', v_ref.id, 'payment_id', v_pay.id, 'tab_id', v_tab.id,
    'amount', v_ref.amount, 'method', v_ref.method, 'till_shift_id', v_ref.till_shift_id,
    'day_session_id', v_ref.day_session_id,
    'totals', app.compute_tab_totals(v_tab.id)));
end $refund$;

revoke all on function app.apply_discount(uuid, adjustment_kind, bigint, text, text) from public, anon, authenticated;
revoke all on function app.refund(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function app.apply_discount(uuid, adjustment_kind, bigint, text, text) to authenticated;
grant execute on function app.refund(uuid, bigint, text, text, text) to authenticated;
