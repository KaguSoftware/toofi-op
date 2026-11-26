-- 0142 guest QR menu: the five guest functions (granted to anon ONLY) and their
-- internal helpers. Contract: .scratch/qr-menu/spec.md, "Guest functions".
--
-- RULE 1 EXCEPTION (owner decision). These five are callable without a staff
-- login. Their first check is a valid table link token (open_table_session) or a
-- live table session (raise_waiter_call, send_guest_order, guest_status), or
-- nothing at all for the public menu (guest_menu). They never write tabs, orders,
-- order_items or stock_movements: a guest order waits in guest_orders until staff
-- accept it (0143).
--
-- REPLAY. Not app.claim_replay: it tells callers apart by auth.uid(), which is
-- NULL for every guest, so one guest could read another's result. A guest write
-- replays through the unique (guest_session_id, idempotency_key) of its own table
-- instead, and a blank key is still IDEMPOTENCY_KEY_REQUIRED.
--
-- VENUE. auth.uid() is NULL here, so venue_id is always written from the table's
-- (or session's) row, never left to the column default.
--
-- SERIALIZING A TABLE. raise_waiter_call, send_guest_order and accept_guest_order
-- take app.lock_guest_table(table) after the day row, so the one-open-call rule,
-- the cooldown, the 3-pending limit and "two accepts land on one tab" hold under
-- concurrency. Lock order: day_sessions -> (table lock) -> guest_orders ->
-- waiter_calls -> tabs -> ...

-- ---------------------------------------------------------------------------
-- Internal helpers (no client grant).
-- ---------------------------------------------------------------------------

-- A guest's note, cleaned: whitespace runs to one space, control and bidi
-- formatting characters removed, trimmed, cut to 140 characters. NULL when the
-- note is not a JSON string or nothing is left.
create or replace function app.clean_guest_note(p_note jsonb) returns text
language sql immutable set search_path = public as $clean_guest_note$
  select nullif(btrim(left(btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(p_note #>> '{}',
                 '[[:space:]   -     　]+', ' ', 'g'),
               '[\u0001-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]', '', 'g'),
             ' {2,}', ' ', 'g')), 140)), '')
   where jsonb_typeof(p_note) = 'string'
$clean_guest_note$;

-- Validate and price a guest basket against the venue's menu now, exactly as
-- app.add_items checks it, with the guest limits (1 to 40 lines, qty 1 to 20).
-- Any price the client sent is ignored. Raises the first refusal.
-- -> {items: [{menu_item_id, qty, modifier_ids[], note}]   (the cleaned request)
--     lines: [{menu_item_id, name_en, name_ar, qty, unit_price, line_total, note,
--              modifiers: [{id, name_en, name_ar, price_delta}]}],
--     total}
create or replace function app.guest_quote(p_venue uuid, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $guest_quote$
declare
  c_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_item  jsonb;
  v_qty   int;
  v_mi    record;
  v_modj  jsonb;
  v_mods  uuid[];
  v_unit  bigint;
  v_note  text;
  v_items jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_total bigint := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'P0001';
  end if;

  for v_item in select e from jsonb_array_elements(p_items) with ordinality as a(e, n) order by n loop
    if jsonb_typeof(v_item -> 'qty') is distinct from 'number' then
      raise exception 'INVALID_QTY' using errcode = 'P0001';
    end if;
    if (v_item ->> 'qty')::numeric <> trunc((v_item ->> 'qty')::numeric)
       or (v_item ->> 'qty')::numeric not between 1 and 20 then
      raise exception 'INVALID_QTY' using errcode = 'P0001';
    end if;
    v_qty := (v_item ->> 'qty')::int;

    if jsonb_typeof(v_item -> 'menu_item_id') is distinct from 'string'
       or (v_item ->> 'menu_item_id') !~ c_uuid then
      raise exception 'ITEM_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    select mi.id, mi.name_en, mi.name_ar, mi.price into v_mi
      from menu_items mi
      join menu_categories mc on mc.id = mi.category_id
      join tax_groups tg on tg.id = mi.tax_group_id
     where mi.id = (v_item ->> 'menu_item_id')::uuid
       and mi.venue_id = p_venue
       and mi.is_active and mc.is_active;
    if not found then
      raise exception 'ITEM_NOT_AVAILABLE' using errcode = 'P0001';
    end if;

    v_modj := v_item -> 'modifier_ids';
    if v_modj is null or jsonb_typeof(v_modj) = 'null' then
      v_modj := '[]'::jsonb;
    end if;
    if jsonb_typeof(v_modj) <> 'array' or exists (
         select 1 from jsonb_array_elements(v_modj) e
          where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ c_uuid) then
      raise exception 'MODIFIER_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    v_mods := array(select (e #>> '{}')::uuid from jsonb_array_elements(v_modj) with ordinality as a(e, n) order by n);
    -- As add_items: each modifier listed once, active, and in a group linked to this item.
    if cardinality(v_mods) <> (
         select count(distinct m.id)
           from modifiers m
           join menu_item_modifier_groups l on l.group_id = m.group_id and l.menu_item_id = v_mi.id
          where m.id = any (v_mods) and m.is_active)
       or cardinality(v_mods) <> (select count(distinct u) from unnest(v_mods) u) then
      raise exception 'MODIFIER_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    -- As add_items: each linked group between min_select and max_select.
    if exists (
         select 1
           from menu_item_modifier_groups l
           join modifier_groups g on g.id = l.group_id
          where l.menu_item_id = v_mi.id
            and (select count(*) from modifiers m where m.group_id = g.id and m.id = any (v_mods))
                not between g.min_select and g.max_select) then
      raise exception 'MODIFIER_SELECTION_INVALID' using errcode = 'P0001';
    end if;

    v_unit := v_mi.price + coalesce((select sum(m.price_delta) from modifiers m where m.id = any (v_mods)), 0);
    if v_unit < 0 then
      raise exception 'INVALID_PRICE' using errcode = 'P0001';
    end if;
    v_note := app.clean_guest_note(v_item -> 'note');

    v_items := v_items || jsonb_build_object(
      'menu_item_id', v_mi.id, 'qty', v_qty, 'modifier_ids', to_jsonb(v_mods), 'note', v_note);
    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_mi.id, 'name_en', v_mi.name_en, 'name_ar', v_mi.name_ar,
      'qty', v_qty, 'unit_price', v_unit, 'line_total', v_unit * v_qty, 'note', v_note,
      'modifiers', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'name_en', m.name_en, 'name_ar', m.name_ar,
                                            'price_delta', m.price_delta)
                         order by array_position(v_mods, m.id))
          from modifiers m where m.id = any (v_mods)), '[]'::jsonb));
    v_total := v_total + v_unit * v_qty;
  end loop;

  return jsonb_build_object('items', v_items, 'lines', v_lines, 'total', v_total);
end $guest_quote$;

-- The live session, or SESSION_EXPIRED. Live: not closed, not expired, table
-- active (rotation closes a table's sessions, so a rotated link needs no test).
create or replace function app.guest_live_session(p_session_id uuid) returns app.guest_sessions
language plpgsql stable security definer set search_path = public as $guest_live_session$
declare
  v_s app.guest_sessions%rowtype;
begin
  select s.* into v_s
    from app.guest_sessions s
    join dining_tables t on t.id = s.table_id
   where s.id = p_session_id and s.closed_at is null and s.expires_at > now() and t.is_active;
  if not found then
    raise exception 'SESSION_EXPIRED' using errcode = 'P0001';
  end if;
  return v_s;
end $guest_live_session$;

-- Activity: the session lives 90 more minutes.
create or replace function app.guest_touch_session(p_session_id uuid) returns void
language sql security definer set search_path = public as $guest_touch_session$
  update app.guest_sessions
     set last_activity_at = now(), expires_at = now() + interval '90 minutes'
   where id = p_session_id
$guest_touch_session$;

-- Serialize guest writes and accepts per table (transaction-scoped).
create or replace function app.lock_guest_table(p_table_id uuid) returns void
language sql security definer set search_path = public as $lock_guest_table$
  select pg_advisory_xact_lock(hashtextextended('rop.guest_table:' || p_table_id::text, 0))
$lock_guest_table$;

-- A table's effective switches: the venue's switch AND the table's own guest_enabled.
create or replace function app.guest_switches(p_table_id uuid)
returns table (calls_enabled boolean, orders_enabled boolean)
language sql stable security definer set search_path = public as $guest_switches$
  select coalesce(vs.guest_calls_enabled, false) and l.guest_enabled,
         coalesce(vs.guest_orders_enabled, false) and l.guest_enabled
    from table_links l
    left join venue_settings vs on vs.venue_id = l.venue_id
   where l.table_id = p_table_id
$guest_switches$;

create or replace function app.waiter_call_json(p_call waiter_calls, p_already boolean) returns jsonb
language sql immutable set search_path = public as $waiter_call_json$
  select jsonb_build_object('call_id', p_call.id, 'status', 'waiting', 'reason', p_call.reason,
                            'called_at', p_call.called_at, 'already', p_already)
$waiter_call_json$;

create or replace function app.guest_order_json(p_order guest_orders) returns jsonb
language sql immutable set search_path = public as $guest_order_json$
  select jsonb_build_object('guest_order_id', p_order.id, 'status', 'pending', 'lines', p_order.quote,
                            'total', p_order.quoted_total, 'sent_at', p_order.sent_at)
$guest_order_json$;

revoke all on function app.clean_guest_note(jsonb) from public, anon, authenticated;
revoke all on function app.guest_quote(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.guest_live_session(uuid) from public, anon, authenticated;
revoke all on function app.guest_touch_session(uuid) from public, anon, authenticated;
revoke all on function app.lock_guest_table(uuid) from public, anon, authenticated;
revoke all on function app.guest_switches(uuid) from public, anon, authenticated;
revoke all on function app.waiter_call_json(waiter_calls, boolean) from public, anon, authenticated;
revoke all on function app.guest_order_json(guest_orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.guest_menu() -> {venue: {name}, categories: [{id, name_en, name_ar, sort,
--   items: [{id, name_en, name_ar, price, sort, modifier_groups: [{id, name_en,
--   name_ar, min_select, max_select, modifiers: [{id, name_en, name_ar, price_delta}]}]}]}]}
-- The single venue's active categories (those with at least one active item),
-- active items and active modifiers, in sort order. Never cost, recipe, stock or
-- tax data.
-- ---------------------------------------------------------------------------
create or replace function app.guest_menu() returns jsonb
language sql stable security definer set search_path = public as $guest_menu$
  with v as (select v.id, v.name from venues v where v.id = app.current_venue())
  select jsonb_build_object(
    'venue', (select jsonb_build_object('name', v.name) from v),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_en', c.name_en, 'name_ar', c.name_ar, 'sort', c.sort,
               'items', (
                 select jsonb_agg(jsonb_build_object(
                          'id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar,
                          'price', i.price, 'sort', i.sort,
                          'modifier_groups', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', g.id, 'name_en', g.name_en, 'name_ar', g.name_ar,
                                     'min_select', g.min_select, 'max_select', g.max_select,
                                     'modifiers', coalesce((
                                       select jsonb_agg(jsonb_build_object(
                                                'id', m.id, 'name_en', m.name_en, 'name_ar', m.name_ar,
                                                'price_delta', m.price_delta)
                                              order by m.created_at, m.id)
                                         from modifiers m
                                        where m.group_id = g.id and m.is_active), '[]'::jsonb))
                                   order by g.created_at, g.id)
                              from menu_item_modifier_groups l
                              join modifier_groups g on g.id = l.group_id
                             where l.menu_item_id = i.id), '[]'::jsonb))
                        order by i.sort, i.name_en, i.id)
                   from menu_items i
                  where i.category_id = c.id and i.is_active))
             order by c.sort, c.name_en, c.id)
        from menu_categories c
       where c.venue_id = (select id from v) and c.is_active
         and exists (select 1 from menu_items i where i.category_id = c.id and i.is_active)), '[]'::jsonb))
$guest_menu$;

-- ---------------------------------------------------------------------------
-- app.open_table_session(token) -> {session_id, table_label, expires_at,
--                                    calls_enabled, orders_enabled, day_open}
-- Unknown token or inactive table: TABLE_LINK_INVALID (never says which).
-- More than 30 new sessions for one table within a minute: TOO_MANY_REQUESTS.
-- ---------------------------------------------------------------------------
create or replace function app.open_table_session(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $open_table_session$
declare
  v_link   table_links%rowtype;
  v_table  dining_tables%rowtype;
  v_recent int;
  v_s      app.guest_sessions%rowtype;
  v_sw     record;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'TABLE_LINK_INVALID' using errcode = 'P0001';
  end if;
  -- FOR UPDATE on the link: one table's session opens (and a rotation) run one at a time.
  select l.* into v_link
    from table_links l
    join dining_tables t on t.id = l.table_id
   where l.token = p_token and t.is_active
     for update of l;
  if not found then
    raise exception 'TABLE_LINK_INVALID' using errcode = 'P0001';
  end if;
  select * into v_table from dining_tables where id = v_link.table_id;

  select count(*) into v_recent
    from app.guest_sessions s
   where s.table_id = v_table.id and s.created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;

  insert into app.guest_sessions (venue_id, table_id, last_activity_at, expires_at)
  values (v_table.venue_id, v_table.id, now(), now() + interval '90 minutes')
  returning * into v_s;

  select * into v_sw from app.guest_switches(v_table.id);
  return jsonb_build_object(
    'session_id', v_s.id,
    'table_label', v_table.label,
    'expires_at', v_s.expires_at,
    'calls_enabled', v_sw.calls_enabled,
    'orders_enabled', v_sw.orders_enabled,
    'day_open', exists (select 1 from day_sessions d where d.venue_id = v_table.venue_id and d.closed_at is null));
end $open_table_session$;

-- ---------------------------------------------------------------------------
-- app.raise_waiter_call(session, reason, key)
--   -> {call_id, status: 'waiting', reason, called_at, already}
-- Checks in order: live session -> replay by key -> switches (GUEST_CALLS_OFF)
-- -> open day (DAY_NOT_OPEN) -> the table's open call today, returned with
-- already: true -> last call today under 120 s ago (CALL_TOO_SOON) -> insert.
-- ---------------------------------------------------------------------------
create or replace function app.raise_waiter_call(
  p_session_id      uuid,
  p_reason          waiter_call_reason,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $raise_waiter_call$
declare
  v_s    app.guest_sessions%rowtype;
  v_call waiter_calls%rowtype;
  v_day  uuid;
  v_last timestamptz;
begin
  v_s := app.guest_live_session(p_session_id);
  perform app.guest_touch_session(v_s.id);
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_call from waiter_calls c
   where c.guest_session_id = v_s.id and c.idempotency_key = p_idempotency_key;
  if found then
    return app.waiter_call_json(v_call, false);
  end if;
  if p_reason is null then
    raise exception 'INVALID_ARGUMENT' using errcode = 'P0001';
  end if;
  if not coalesce((select sw.calls_enabled from app.guest_switches(v_s.table_id) sw), false) then
    raise exception 'GUEST_CALLS_OFF' using errcode = 'P0001';
  end if;

  -- Lock order: day_sessions (FOR SHARE: close_day waits), then the table.
  select d.id into v_day from day_sessions d
   where d.venue_id = v_s.venue_id and d.closed_at is null
   for share;
  if v_day is null then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;
  perform app.lock_guest_table(v_s.table_id);
  -- Again under the lock: the same key sent twice at once.
  select * into v_call from waiter_calls c
   where c.guest_session_id = v_s.id and c.idempotency_key = p_idempotency_key;
  if found then
    return app.waiter_call_json(v_call, false);
  end if;

  select * into v_call from waiter_calls c
   where c.table_id = v_s.table_id and c.day_session_id = v_day and c.answered_at is null;
  if found then
    return app.waiter_call_json(v_call, true);
  end if;
  select max(c.called_at) into v_last from waiter_calls c
   where c.table_id = v_s.table_id and c.day_session_id = v_day;
  if v_last > now() - interval '120 seconds' then
    raise exception 'CALL_TOO_SOON' using errcode = 'P0001';
  end if;

  insert into waiter_calls (venue_id, table_id, day_session_id, guest_session_id, reason, idempotency_key)
  values (v_s.venue_id, v_s.table_id, v_day, v_s.id, p_reason, p_idempotency_key)
  returning * into v_call;
  return app.waiter_call_json(v_call, false);
end $raise_waiter_call$;

-- ---------------------------------------------------------------------------
-- app.send_guest_order(session, items, key)
--   -> {guest_order_id, status: 'pending', lines, total, sent_at}
-- Checks in order: live session -> replay by key -> switches (GUEST_ORDERS_OFF)
-- -> open day (DAY_NOT_OPEN) -> validation (app.guest_quote) -> 3 pending orders
-- on the table today (TOO_MANY_PENDING_ORDERS) -> insert. Writes guest_orders only.
-- ---------------------------------------------------------------------------
create or replace function app.send_guest_order(
  p_session_id      uuid,
  p_items           jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $send_guest_order$
declare
  v_s     app.guest_sessions%rowtype;
  v_order guest_orders%rowtype;
  v_day   uuid;
  v_quote jsonb;
begin
  v_s := app.guest_live_session(p_session_id);
  perform app.guest_touch_session(v_s.id);
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_order from guest_orders g
   where g.guest_session_id = v_s.id and g.idempotency_key = p_idempotency_key;
  if found then
    return app.guest_order_json(v_order);
  end if;
  if not coalesce((select sw.orders_enabled from app.guest_switches(v_s.table_id) sw), false) then
    raise exception 'GUEST_ORDERS_OFF' using errcode = 'P0001';
  end if;

  select d.id into v_day from day_sessions d
   where d.venue_id = v_s.venue_id and d.closed_at is null
   for share;
  if v_day is null then
    raise exception 'DAY_NOT_OPEN' using errcode = 'P0001';
  end if;
  v_quote := app.guest_quote(v_s.venue_id, p_items);

  perform app.lock_guest_table(v_s.table_id);
  select * into v_order from guest_orders g
   where g.guest_session_id = v_s.id and g.idempotency_key = p_idempotency_key;
  if found then
    return app.guest_order_json(v_order);
  end if;
  if (select count(*) from guest_orders g
       where g.table_id = v_s.table_id and g.day_session_id = v_day and g.status = 'pending') >= 3 then
    raise exception 'TOO_MANY_PENDING_ORDERS' using errcode = 'P0001';
  end if;

  insert into guest_orders (venue_id, table_id, day_session_id, guest_session_id, items, quote,
                            quoted_total, idempotency_key)
  values (v_s.venue_id, v_s.table_id, v_day, v_s.id, v_quote -> 'items', v_quote -> 'lines',
          (v_quote ->> 'total')::bigint, p_idempotency_key)
  returning * into v_order;
  return app.guest_order_json(v_order);
end $send_guest_order$;

-- ---------------------------------------------------------------------------
-- app.guest_status(session) -> {table_label, expires_at, day_open, calls_enabled,
--   orders_enabled, call, call_again_at, orders}
-- Read-only: does not slide the session.
--   call: the table's open call today, else this session's latest call today,
--         else null: {id, reason, status: 'waiting' | 'answered', called_at, answered_at}.
--   call_again_at: when the table's 120 s cooldown ends, or null.
--   orders: this session's orders, newest first: {id, status, sent_at, lines, total};
--           a pending order whose business day has closed reads 'expired'.
-- "Today" is the open business day.
-- ---------------------------------------------------------------------------
create or replace function app.guest_status(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $guest_status$
declare
  v_s     app.guest_sessions%rowtype;
  v_label text;
  v_day   uuid;
  v_sw    record;
  v_call  waiter_calls%rowtype;
  v_again timestamptz;
begin
  v_s := app.guest_live_session(p_session_id);
  select t.label into v_label from dining_tables t where t.id = v_s.table_id;
  select d.id into v_day from day_sessions d where d.venue_id = v_s.venue_id and d.closed_at is null;
  select * into v_sw from app.guest_switches(v_s.table_id);

  if v_day is not null then
    select * into v_call from waiter_calls c
     where c.table_id = v_s.table_id and c.day_session_id = v_day and c.answered_at is null;
    if not found then
      select * into v_call from waiter_calls c
       where c.guest_session_id = v_s.id and c.day_session_id = v_day
       order by c.called_at desc, c.id desc
       limit 1;
    end if;
    select max(c.called_at) + interval '120 seconds' into v_again from waiter_calls c
     where c.table_id = v_s.table_id and c.day_session_id = v_day;
    if v_again <= now() then
      v_again := null;
    end if;
  end if;

  return jsonb_build_object(
    'table_label', v_label,
    'expires_at', v_s.expires_at,
    'day_open', v_day is not null,
    'calls_enabled', v_sw.calls_enabled,
    'orders_enabled', v_sw.orders_enabled,
    'call', case when v_call.id is null then null else jsonb_build_object(
              'id', v_call.id, 'reason', v_call.reason,
              'status', case when v_call.answered_at is null then 'waiting' else 'answered' end,
              'called_at', v_call.called_at, 'answered_at', v_call.answered_at) end,
    'call_again_at', v_again,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'status', case when g.status = 'pending' and d.closed_at is not null then 'expired'
                              else g.status::text end,
               'sent_at', g.sent_at, 'lines', g.quote, 'total', g.quoted_total)
             order by g.sent_at desc, g.id desc)
        from guest_orders g
        join day_sessions d on d.id = g.day_session_id
       where g.guest_session_id = v_s.id), '[]'::jsonb));
end $guest_status$;

-- Guest functions: anon only (the guest site's server calls with the anon key).
revoke all on function app.guest_menu() from public, anon, authenticated;
revoke all on function app.open_table_session(text) from public, anon, authenticated;
revoke all on function app.raise_waiter_call(uuid, waiter_call_reason, text) from public, anon, authenticated;
revoke all on function app.send_guest_order(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function app.guest_status(uuid) from public, anon, authenticated;
grant execute on function app.guest_menu() to anon;
grant execute on function app.open_table_session(text) to anon;
grant execute on function app.raise_waiter_call(uuid, waiter_call_reason, text) to anon;
grant execute on function app.send_guest_order(uuid, jsonb, text) to anon;
grant execute on function app.guest_status(uuid) to anon;
