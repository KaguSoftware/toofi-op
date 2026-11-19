-- 0120 a count no longer erases sales made between counting and finalizing.
--
-- Until now finalize_count adjusted on-hand to counted - on-hand AT FINALIZE.
-- 50 counted at 10:00, 5 sold at 10:30, finalized at 11:00: on-hand became 50,
-- so the 5 sold vanished from the ledger. It must end at 45.
--
-- Now save_count_lines snapshots the ingredient's on-hand at the moment the
-- line is saved into stock_count_lines.on_hand_at_save, and finalize_count
-- writes count_adjust = counted - on_hand_at_save. Movements after the save
-- (sales, voids, waste, deliveries) stay in the ledger on top of the count.
-- Re-saving a line takes a fresh snapshot; clearing it (counted NULL) clears it.
-- A line saved before this migration has no snapshot and falls back to on-hand
-- at finalize (the old rule).
--
-- Blind: like `expected`, the column is outside the 0084 column grant, so no
-- client can read it, and no count function returns it.

alter table stock_count_lines add column on_hand_at_save numeric(12,3);

-- ---------------------------------------------------------------------------
-- app.save_count_lines(count, lines [{ingredient_id, counted}]) -> {count_id, saved}
-- As 0042, plus the at-save snapshot.
-- ---------------------------------------------------------------------------
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

  insert into stock_count_lines (count_id, ingredient_id, expected, counted, on_hand_at_save)
  select p_count_id, x.ingredient_id, oh.qty, x.counted,
         case when x.counted is not null then oh.qty end
    from jsonb_to_recordset(p_lines) as x(ingredient_id uuid, counted numeric)
    cross join lateral (select app.ingredient_on_hand(x.ingredient_id) as qty) oh
  on conflict (count_id, ingredient_id) do update
    set counted = excluded.counted, on_hand_at_save = excluded.on_hand_at_save;
  get diagnostics v_saved = row_count;

  perform app.write_audit('count.save', 'stock_counts', p_count_id, null, jsonb_build_object('lines', p_lines));
  return jsonb_build_object('count_id', p_count_id, 'saved', v_saved);
end $save_count_lines$;

-- ---------------------------------------------------------------------------
-- app.finalize_count(count) -> {count_id, adjustments: [{ingredient_id, qty}]}
-- qty = counted - on-hand when the line was saved.
-- ---------------------------------------------------------------------------
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
    select l.id, l.ingredient_id, l.counted, l.on_hand_at_save, i.cost_per_unit
      from stock_count_lines l
      join ingredients i on i.id = l.ingredient_id
     where l.count_id = p_count_id and l.counted is not null
     order by l.ingredient_id
       for update of i
  loop
    v_adjust := v_line.counted - coalesce(v_line.on_hand_at_save, app.ingredient_on_hand(v_line.ingredient_id));
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

revoke all on function app.save_count_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.finalize_count(uuid) from public, anon, authenticated;
grant execute on function app.save_count_lines(uuid, jsonb) to authenticated;
grant execute on function app.finalize_count(uuid) to authenticated;
