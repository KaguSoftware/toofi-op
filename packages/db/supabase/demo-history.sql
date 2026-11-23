-- demo-history.sql: three weeks of made-up trading so the reports have something to show.
-- LOCAL DEV ONLY. Run it by hand after `pnpm db:reset` (it is not part of the seed):
--   pnpm --filter @rop/db db:demo
-- It writes straight into the tables as the database owner, with triggers off so every
-- row can carry a past timestamp. Never run it against a hosted project.
-- Safe to run twice: it stops if the history is already there.

do $demo$
declare
  v_venue   uuid := '00000000-0000-4000-8000-000000000001';
  v_owner   uuid := '00000000-0000-4000-8000-0000000000a1';
  v_manager uuid := '00000000-0000-4000-8000-0000000000a2';
  v_cashier uuid := '00000000-0000-4000-8000-0000000000a3';
  v_waiter  uuid := '00000000-0000-4000-8000-0000000000a4';
  v_tz      text := 'Asia/Baghdad';
  v_today   date := (now() at time zone 'Asia/Baghdad')::date;
  d         date;
  v_day     uuid;
  v_shift   uuid;
  v_tab     uuid;
  v_order   uuid;
  v_line    uuid;
  v_pay     uuid;
  v_staff   uuid;
  v_open    timestamptz;
  v_close   timestamptz;
  v_tabs    int;
  v_total   bigint;
  v_disc    bigint;
  v_cash    bigint;
  v_var     bigint;
  v_method  payment_method;
  it        record;
  ing       record;
  i         int;
  n         int := 0;
begin
  if exists (select 1 from tabs where venue_id = v_venue and idempotency_key like 'demo:%') then
    raise notice 'demo history is already there; nothing done';
    return;
  end if;
  set local session_replication_role = replica;  -- no triggers: we date every row ourselves

  for d in select g::date from generate_series(v_today - 21, v_today - 1, interval '1 day') g loop
    n := n + 1;
    insert into day_sessions (venue_id, business_date, opened_by, opened_at, closed_by, closed_at)
    values (v_venue, d, v_manager, (d + time '10:00') at time zone v_tz, v_manager, (d + time '23:59') at time zone v_tz)
    on conflict (venue_id, business_date) do nothing
    returning id into v_day;
    continue when v_day is null;

    v_cash := 0;
    v_shift := gen_random_uuid();
    -- Thursday and Friday are the busy nights.
    v_tabs := (12 + floor(random() * 8))::int * case when extract(dow from d) in (4, 5) then 2 else 1 end;

    for i in 1 .. v_tabs loop
      v_staff := case when random() < 0.72 then v_waiter else v_manager end;
      v_open := (d + case when random() < 0.38 then time '12:00' + random() * interval '3 hours'
                          else time '19:00' + random() * interval '4 hours' end) at time zone v_tz;
      v_close := v_open + interval '35 minutes' + random() * interval '60 minutes';
      insert into tabs (venue_id, day_session_id, table_id, waiter_id, covers, status, opened_at, closed_at, idempotency_key)
      values (v_venue, v_day, (select id from dining_tables where venue_id = v_venue order by random() limit 1),
              v_staff, 1 + floor(random() * 5)::int, 'settled', v_open, v_close, 'demo:' || gen_random_uuid())
      returning id into v_tab;
      insert into orders (venue_id, tab_id, placed_by, placed_at, idempotency_key)
      values (v_venue, v_tab, v_staff, v_open + interval '4 minutes', 'demo:' || gen_random_uuid())
      returning id into v_order;

      v_total := 0;
      -- Two to five different items; some items are simply more popular than others.
      for it in
        select m.id, m.name_en, m.name_ar, m.price::bigint as price, (1 + floor(random() * 2.4))::int as qty
          from menu_items m
         where m.venue_id = v_venue and m.is_active
         order by power(random(), 1 + (abs(hashtext(m.id::text)) % 4)) desc
         limit 2 + floor(random() * 4)::int
      loop
        insert into order_items (venue_id, order_id, tab_id, menu_item_id, name_en, name_ar, unit_price, qty, line_total, tax_rate_bps, created_at)
        values (v_venue, v_order, v_tab, it.id, it.name_en, it.name_ar, it.price, it.qty, it.price * it.qty, 0, v_open + interval '4 minutes')
        returning id into v_line;
        insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, ref_table, ref_id, created_at)
        select v_venue, rl.ingredient_id, 'sale', -(rl.qty * it.qty), g.cost_per_unit, 'order_items', v_line, v_open + interval '4 minutes'
          from recipe_lines rl join ingredients g on g.id = rl.ingredient_id
         where rl.menu_item_id = it.id;
        v_total := v_total + it.price * it.qty;
      end loop;

      -- A voided extra line: now and then for the waiter, often on the manager's tables.
      if random() < (case when v_staff = v_manager then 0.22 else 0.03 end) then
        select m.id, m.name_en, m.name_ar, m.price::bigint as price into it
          from menu_items m where m.venue_id = v_venue and m.is_active order by random() limit 1;
        insert into order_items (venue_id, order_id, tab_id, menu_item_id, name_en, name_ar, unit_price, qty, line_total, tax_rate_bps,
                                 created_at, voided_at, voided_by, void_reason, void_authorized_by)
        values (v_venue, v_order, v_tab, it.id, it.name_en, it.name_ar, it.price, 1, it.price, 0,
                v_open + interval '6 minutes', v_open + interval '15 minutes', v_staff, 'Guest changed their mind', v_manager);
      end if;

      v_disc := 0;
      if random() < 0.07 then
        v_disc := round(v_total * 0.1 / 250) * 250;
        insert into tab_adjustments (venue_id, tab_id, kind, value, amount, reason, applied_by, authorized_by, created_at)
        values (v_venue, v_tab, 'discount_percent', 1000, v_disc, 'Regular guest', v_cashier, v_manager, v_close - interval '2 minutes');
      end if;

      v_method := case when random() < 0.78 then 'cash' else 'card' end;
      insert into payments (venue_id, tab_id, method, amount, tendered, change, taken_by, till_shift_id, device_id, idempotency_key, created_at)
      values (v_venue, v_tab, v_method, v_total - v_disc, case when v_method = 'cash' then v_total - v_disc end, 0,
              v_cashier, v_shift, 'TILL-1', 'demo:' || gen_random_uuid(), v_close)
      returning id into v_pay;
      if v_method = 'cash' then v_cash := v_cash + v_total - v_disc; end if;

      if random() < 0.012 then
        insert into refunds (venue_id, payment_id, tab_id, amount, method, reason, refunded_by, authorized_by, till_shift_id,
                             device_id, day_session_id, created_at)
        values (v_venue, v_pay, v_tab, least(5000, v_total - v_disc), v_method, 'Cold dish', v_cashier, v_manager, v_shift,
                'TILL-1', v_day, v_close + interval '10 minutes');
        if v_method = 'cash' then v_cash := v_cash - least(5000, v_total - v_disc); end if;
      end if;
    end loop;

    -- Every third day the cashier pays the bread supplier from the drawer.
    if n % 3 = 0 then
      insert into cash_movements (venue_id, till_shift_id, day_session_id, kind, amount, reason, staff_id, authorized_by, idempotency_key, created_at)
      values (v_venue, v_shift, v_day, 'paid_out', 15000, 'Bread supplier', v_cashier, v_manager, 'demo:' || gen_random_uuid(),
              (d + time '11:30') at time zone v_tz);
      v_cash := v_cash - 15000;
    end if;

    -- The cashier's shift: usually exact or a coin out, twice clearly short.
    v_var := case when n in (9, 18) then -(8000 + floor(random() * 6) * 1000)::bigint
                  else (array[0, 0, 0, 250, -250, -500])[1 + floor(random() * 6)::int] end;
    insert into till_shifts (id, venue_id, staff_id, device_id, opened_at, opening_float, closed_at, closed_by, counted_cash, expected_cash, variance)
    values (v_shift, v_venue, v_cashier, 'TILL-1', (d + time '10:05') at time zone v_tz, 100000,
            (d + time '23:55') at time zone v_tz, v_cashier, 100000 + v_cash + v_var, 100000 + v_cash, v_var);
  end loop;

  -- Deliveries two weeks ago and again now (after the seed's opening delivery): two ingredients cost more now.
  for ing in select g.id, g.cost_per_unit, row_number() over (order by g.name_en) as rn
               from ingredients g where g.venue_id = v_venue and g.is_active loop
    for i in 0 .. 1 loop
      v_order := gen_random_uuid();
      insert into deliveries (id, venue_id, received_by, received_at, idempotency_key)
      values (v_order, v_venue, v_manager, case when i = 0 then ((v_today - 14) + time '09:00') at time zone v_tz else now() end,
              'demo:' || gen_random_uuid());
      insert into delivery_lines (venue_id, delivery_id, ingredient_id, qty, unit_cost, created_at)
      values (v_venue, v_order, ing.id, 1000,
              ing.cost_per_unit * case when i = 1 and ing.rn in (4, 11) then 1.18 when i = 1 and ing.rn = 7 then 0.94 else 1 end,
              case when i = 0 then ((v_today - 14) + time '09:00') at time zone v_tz else now() end);
    end loop;
  end loop;

  -- Waste on a handful of days, and what one stock count found missing five days ago.
  insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, created_at)
  select v_venue, g.id, 'waste', -round((g.reorder_point * (0.05 + random() * 0.1))::numeric, 0) - 1, g.cost_per_unit,
         ((v_today - (1 + floor(random() * 14))::int) + time '22:30') at time zone v_tz
    from ingredients g where g.venue_id = v_venue and g.is_active order by random() limit 9;
  insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, created_at)
  select v_venue, g.id, 'count_adjust',
         case when random() < 0.8 then -1 else 1 end * (round((g.reorder_point * (0.04 + random() * 0.12))::numeric, 0) + 1),
         g.cost_per_unit, ((v_today - 5) + time '23:10') at time zone v_tz
    from ingredients g where g.venue_id = v_venue and g.is_active order by random() limit 7;

  -- Restock what three weeks of sales used, leaving a few ingredients low on purpose.
  insert into stock_movements (venue_id, ingredient_id, kind, qty, unit_cost, created_at)
  select v_venue, x.id, 'delivery', x.need, x.cost_per_unit, now()
    from (select g.id, g.cost_per_unit, row_number() over (order by g.name_en) as rn,
                 g.reorder_point * 3 - coalesce((select sum(m.qty) from stock_movements m where m.ingredient_id = g.id), 0) as need
            from ingredients g where g.venue_id = v_venue and g.is_active) x
   where x.need > 0 and x.rn not in (3, 9, 16);

  raise notice 'demo history written: % days', n;
end $demo$;
