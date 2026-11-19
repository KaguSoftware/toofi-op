-- 0042 stock operations: deliveries (weighted average cost), waste, blind counts.
-- Manager and owner only; every function is audited and returns jsonb.
--
-- Shapes:
--   receive_delivery(p_supplier_id, p_lines [{ingredient_id, qty, unit_cost}], p_note, p_idempotency_key)
--                      -> {delivery_id}
--   record_waste(p_ingredient_id, p_qty, p_reason, p_idempotency_key) -> {movement_id}
--   start_count()      -> {count_id}
--   save_count_lines(p_count_id, p_lines [{ingredient_id, counted}]) -> {count_id, saved}
--   finalize_count(p_count_id) -> {count_id, adjustments: [{ingredient_id, qty}]}
--
-- Counts are blind: start_count snapshots `expected` (on-hand at the start) into
-- stock_count_lines for every active ingredient, but no count function ever
-- returns expected or on-hand. finalize_count writes count_adjust = counted -
-- on-hand AT FINALIZE, so sales made while people were counting are kept and
-- on-hand ends exactly at the counted figure. Lines left uncounted (counted
-- NULL) are not adjusted. A counted line equal to on-hand writes nothing.
--
-- Lock order (CLAUDE.md rule 9): ingredients (FOR UPDATE, in id order) before
-- appending stock_movements.

-- On-hand = the sum of the ledger. Internal helper.
create or replace function app.ingredient_on_hand(p_ingredient_id uuid) returns numeric
language sql stable security definer set search_path = public as $ingredient_on_hand$
  select coalesce(sum(m.qty), 0) from stock_movements m where m.ingredient_id = p_ingredient_id
$ingredient_on_hand$;

revoke all on function app.ingredient_on_hand(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- receive_delivery. For each line: cost_per_unit becomes the weighted average
--   (on_hand x cost_per_unit + qty x unit_cost) / (on_hand + qty)
-- where a negative on-hand counts as zero (the missing stock has no value, so
-- the delivery's cost wins). Several lines of one ingredient apply in order.
-- ---------------------------------------------------------------------------
create or replace function app.receive_delivery(
  p_supplier_id     uuid,
  p_lines           jsonb,
  p_note            text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $receive_delivery$
declare
  v_venue    uuid := app.current_venue();
  v_replay   jsonb;
  v_delivery uuid;
  v_line     record;
  v_ing      ingredients%rowtype;
  v_base     numeric;
  v_line_id  uuid;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'STOCK_LINES_INVALID' using errcode = 'P0001';
  end if;
  if p_supplier_id is not null
     and not exists (select 1 from suppliers s where s.id = p_supplier_id and s.venue_id = v_venue) then
    raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, qty numeric, unit_cost numeric)
              where x.qty is null or x.qty <= 0) then
    raise exception 'STOCK_QTY_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, qty numeric, unit_cost numeric)
              where x.unit_cost is null or x.unit_cost < 0) then
    raise exception 'STOCK_COST_INVALID' using errcode = 'P0001';
  end if;

  -- Lock every ingredient of the delivery, in id order, before any movement.
  perform 1 from ingredients i
   where i.id in (select (e ->> 'ingredient_id')::uuid from jsonb_array_elements(p_lines) e)
     and i.venue_id = v_venue
   order by i.id
     for update;

  insert into deliveries (supplier_id, received_by, note, idempotency_key)
  values (p_supplier_id, auth.uid(), nullif(btrim(p_note), ''), p_idempotency_key)
  returning id into v_delivery;

  for v_line in
    select (e.v ->> 'ingredient_id')::uuid as ingredient_id,
           (e.v ->> 'qty')::numeric as qty,
           (e.v ->> 'unit_cost')::numeric as unit_cost
      from jsonb_array_elements(p_lines) with ordinality as e(v, n)
     order by e.n
  loop
    select * into v_ing from ingredients where id = v_line.ingredient_id and venue_id = v_venue;
    if not found then
      raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
    end if;

    v_base := greatest(app.ingredient_on_hand(v_ing.id), 0);

    insert into delivery_lines (delivery_id, ingredient_id, qty, unit_cost)
    values (v_delivery, v_ing.id, v_line.qty, v_line.unit_cost)
    returning id into v_line_id;

    insert into stock_movements (ingredient_id, kind, qty, unit_cost, ref_table, ref_id, actor_id)
    values (v_ing.id, 'delivery', v_line.qty, v_line.unit_cost, 'delivery_lines', v_line_id, auth.uid());

    update ingredients
       set cost_per_unit = (v_base * v_ing.cost_per_unit + v_line.qty * v_line.unit_cost) / (v_base + v_line.qty)
     where id = v_ing.id;
  end loop;

  perform app.write_audit('delivery.receive', 'deliveries', v_delivery, null,
                          jsonb_build_object('supplier_id', p_supplier_id, 'lines', p_lines, 'note', p_note));
  return app.finish_replay(p_idempotency_key, jsonb_build_object('delivery_id', v_delivery));
end $receive_delivery$;

-- ---------------------------------------------------------------------------
-- record_waste: a `waste` movement at the current cost; the reason is audited.
-- ---------------------------------------------------------------------------
create or replace function app.record_waste(
  p_ingredient_id   uuid,
  p_qty             numeric,
  p_reason          text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $record_waste$
declare
  v_replay   jsonb;
  v_ing      ingredients%rowtype;
  v_movement uuid;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_replay := app.claim_replay(p_idempotency_key);
  if v_replay is not null then
    return v_replay;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'WASTE_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'STOCK_QTY_INVALID' using errcode = 'P0001';
  end if;
  select * into v_ing from ingredients
   where id = p_ingredient_id and venue_id = app.current_venue() for update;
  if not found then
    raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into stock_movements (ingredient_id, kind, qty, unit_cost, actor_id)
  values (v_ing.id, 'waste', -p_qty, v_ing.cost_per_unit, auth.uid())
  returning id into v_movement;

  perform app.write_audit('stock.waste', 'stock_movements', v_movement, null,
                          jsonb_build_object('ingredient_id', v_ing.id, 'qty', p_qty), btrim(p_reason));
  return app.finish_replay(p_idempotency_key, jsonb_build_object('movement_id', v_movement));
end $record_waste$;

-- ---------------------------------------------------------------------------
-- Counts
-- ---------------------------------------------------------------------------
create or replace function app.start_count() returns jsonb
language plpgsql security definer set search_path = public as $start_count$
declare
  v_venue uuid := app.current_venue();
  v_count uuid;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from stock_counts c where c.venue_id = v_venue and c.finalized_at is null) then
    raise exception 'COUNT_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  begin
    insert into stock_counts (started_by) values (auth.uid()) returning id into v_count;
  exception when unique_violation then
    raise exception 'COUNT_ALREADY_OPEN' using errcode = 'P0001';
  end;

  insert into stock_count_lines (count_id, ingredient_id, expected)
  select v_count, i.id, app.ingredient_on_hand(i.id)
    from ingredients i
   where i.venue_id = v_venue and i.is_active;

  perform app.write_audit('count.start', 'stock_counts', v_count);
  return jsonb_build_object('count_id', v_count);
end $start_count$;

-- Lock the count and check it is this venue's and still open.
create or replace function app.lock_open_count(p_count_id uuid) returns stock_counts
language plpgsql security definer set search_path = public as $lock_open_count$
declare
  v_count stock_counts%rowtype;
begin
  select * into v_count from stock_counts
   where id = p_count_id and venue_id = app.current_venue() for update;
  if not found then
    raise exception 'COUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_count.finalized_at is not null then
    raise exception 'COUNT_NOT_OPEN' using errcode = 'P0001';
  end if;
  return v_count;
end $lock_open_count$;

revoke all on function app.lock_open_count(uuid) from public, anon, authenticated;

-- counted NULL clears a line. An ingredient missing from the snapshot (created
-- after the count started) gets a line with expected = on-hand now.
create or replace function app.save_count_lines(p_count_id uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $save_count_lines$
declare
  v_venue uuid := app.current_venue();
  v_saved int;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform app.lock_open_count(p_count_id);

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'STOCK_LINES_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, counted numeric)
              where x.counted < 0) then
    raise exception 'STOCK_QTY_INVALID' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, counted numeric)
              left join ingredients i on i.id = x.ingredient_id and i.venue_id = v_venue
              where i.id is null) then
    raise exception 'INGREDIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into stock_count_lines (count_id, ingredient_id, expected, counted)
  select p_count_id, x.ingredient_id, app.ingredient_on_hand(x.ingredient_id), x.counted
    from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, counted numeric)
  on conflict (count_id, ingredient_id) do update set counted = excluded.counted;
  get diagnostics v_saved = row_count;

  perform app.write_audit('count.save', 'stock_counts', p_count_id, null, jsonb_build_object('lines', p_lines));
  return jsonb_build_object('count_id', p_count_id, 'saved', v_saved);
end $save_count_lines$;

create or replace function app.finalize_count(p_count_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $finalize_count$
declare
  v_line   record;
  v_adjust numeric;
  v_out    jsonb := '[]'::jsonb;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform app.lock_open_count(p_count_id);

  for v_line in
    select l.id, l.ingredient_id, l.counted, i.cost_per_unit
      from stock_count_lines l
      join ingredients i on i.id = l.ingredient_id
     where l.count_id = p_count_id and l.counted is not null
     order by l.ingredient_id
       for update of i
  loop
    v_adjust := v_line.counted - app.ingredient_on_hand(v_line.ingredient_id);
    if v_adjust <> 0 then
      insert into stock_movements (ingredient_id, kind, qty, unit_cost, ref_table, ref_id, actor_id)
      values (v_line.ingredient_id, 'count_adjust', v_adjust, v_line.cost_per_unit,
              'stock_count_lines', v_line.id, auth.uid());
      v_out := v_out || jsonb_build_object('ingredient_id', v_line.ingredient_id, 'qty', v_adjust);
    end if;
  end loop;

  update stock_counts set finalized_at = now(), finalized_by = auth.uid() where id = p_count_id;

  perform app.write_audit('count.finalize', 'stock_counts', p_count_id, null,
                          jsonb_build_object('adjustments', v_out));
  return jsonb_build_object('count_id', p_count_id, 'adjustments', v_out);
end $finalize_count$;

revoke all on function app.receive_delivery(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function app.record_waste(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function app.start_count() from public, anon, authenticated;
revoke all on function app.save_count_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.finalize_count(uuid) from public, anon, authenticated;
grant execute on function app.receive_delivery(uuid, jsonb, text, text) to authenticated;
grant execute on function app.record_waste(uuid, numeric, text, text) to authenticated;
grant execute on function app.start_count() to authenticated;
grant execute on function app.save_count_lines(uuid, jsonb) to authenticated;
grant execute on function app.finalize_count(uuid) to authenticated;
