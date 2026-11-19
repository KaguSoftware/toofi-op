-- 0025 read views for the floor and the till. security_invoker, so the
-- tables' own RLS (active staff of the venue) applies to the reader.

-- Every active table, with its open tab if it has one.
create view v_floor_status with (security_invoker = true) as
select dt.id       as table_id,
       dt.label,
       dt.area_id,
       dt.seats,
       dt.grid_x,
       dt.grid_y,
       t.id        as tab_id,
       t.covers,
       t.waiter_id,
       s.full_name as waiter_name,
       t.opened_at,
       (x.tt ->> 'total')::bigint as total,
       (x.tt ->> 'due')::bigint   as due
  from dining_tables dt
  left join tabs t on t.table_id = dt.id and t.status = 'open'
  left join staff s on s.id = t.waiter_id
  left join lateral (select app.compute_tab_totals(t.id) as tt where t.id is not null) x on true
 where dt.is_active;

-- Every open tab, with its totals.
create view v_open_tabs with (security_invoker = true) as
select t.id        as tab_id,
       t.day_session_id,
       t.table_id,
       dt.label    as table_label,
       t.covers,
       t.waiter_id,
       s.full_name as waiter_name,
       t.opened_at,
       (x.tt ->> 'subtotal')::bigint as subtotal,
       (x.tt ->> 'discount')::bigint as discount,
       (x.tt ->> 'tax')::bigint      as tax,
       (x.tt ->> 'total')::bigint    as total,
       (x.tt ->> 'paid')::bigint     as paid,
       (x.tt ->> 'due')::bigint      as due
  from tabs t
  left join dining_tables dt on dt.id = t.table_id
  left join staff s on s.id = t.waiter_id
  cross join lateral (select app.compute_tab_totals(t.id) as tt) x
 where t.status = 'open';

revoke all on v_floor_status, v_open_tabs from anon, authenticated;
grant select on v_floor_status, v_open_tabs to authenticated;
