-- 0084 the blind count no longer leaks (review fix).
--
-- stock_count_lines.expected (on-hand when the count started) was readable by
-- any staff through the table's select policy, so a counter could look it up.
-- Like staff.pin_hash, it is now cut out with a column grant. The only way to
-- read it is app.stock_count_report, for managers and owners, and only once the
-- count is finalized.

revoke select on stock_count_lines from authenticated;
grant select (id, venue_id, count_id, ingredient_id, counted, created_at) on stock_count_lines to authenticated;

-- ---------------------------------------------------------------------------
-- app.stock_count_report(count) -> {count_id, started_at, finalized_at,
--   lines: [{ingredient_id, expected, counted, variance}]}
-- Manager and owner, finalized counts only (COUNT_NOT_FINALIZED otherwise).
-- expected: on-hand when the count started (or when the line was first saved,
-- for an ingredient created during the count); variance = counted - expected,
-- NULL for a line left uncounted. Lines in ingredient id order.
-- ---------------------------------------------------------------------------
create or replace function app.stock_count_report(p_count_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $stock_count_report$
declare
  v_count stock_counts%rowtype;
begin
  if not app.is_staff('manager', 'owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_count from stock_counts c where c.id = p_count_id and c.venue_id = app.current_venue();
  if not found then
    raise exception 'COUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_count.finalized_at is null then
    raise exception 'COUNT_NOT_FINALIZED' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'count_id', v_count.id,
    'started_at', v_count.started_at,
    'finalized_at', v_count.finalized_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('ingredient_id', l.ingredient_id, 'expected', l.expected,
                                          'counted', l.counted, 'variance', l.counted - l.expected)
                       order by l.ingredient_id)
        from stock_count_lines l
       where l.count_id = v_count.id), '[]'::jsonb));
end $stock_count_report$;

revoke all on function app.stock_count_report(uuid) from public, anon, authenticated;
grant execute on function app.stock_count_report(uuid) to authenticated;
