-- 0045 realtime: broadcast-from-database refetch signals.
--
--  * Topics (private channels):
--      tabs:<venue_id>   any change to tabs, orders, order_items, payments, refunds
--      stock:<venue_id>  any new stock_movements row
--  * Event 'changed', payload {table, id}: a signal only. The client refetches;
--    no row data ever travels on a broadcast.
--  * Every send is wrapped in BEGIN ... EXCEPTION WHEN OTHERS THEN NULL: a missing
--    or unhealthy realtime schema must NEVER fail the business write.
--  * Who may listen: RLS on realtime.messages, active staff of that venue only.
--    Created only when realtime.messages exists, so a stripped stack still resets.
--
-- Statement order matters only per row; AFTER triggers, so a rolled-back write
-- never broadcasts (realtime.send inserts into realtime.messages in the same
-- transaction).

create or replace function app.rt_signal() returns trigger
language plpgsql security definer set search_path = public as $rt_signal$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'id', v_row ->> 'id'),
      'changed',
      tg_argv[0] || ':' || (v_row ->> 'venue_id'),
      true);
  exception when others then null;
  end;
  return null;
end $rt_signal$;

revoke all on function app.rt_signal() from public, anon, authenticated;

create trigger tabs_rt          after insert or update or delete on tabs
  for each row execute function app.rt_signal('tabs');
create trigger orders_rt        after insert or update or delete on orders
  for each row execute function app.rt_signal('tabs');
create trigger order_items_rt   after insert or update or delete on order_items
  for each row execute function app.rt_signal('tabs');
create trigger payments_rt      after insert on payments
  for each row execute function app.rt_signal('tabs');
create trigger refunds_rt       after insert on refunds
  for each row execute function app.rt_signal('tabs');
create trigger stock_movements_rt after insert on stock_movements
  for each row execute function app.rt_signal('stock');

do $rt_policies$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages absent - skipping broadcast RLS policies';
    return;
  end if;

  execute $p$
    drop policy if exists rop_rt_venue_topics on realtime.messages
  $p$;
  execute $p$
    create policy rop_rt_venue_topics on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and realtime.topic() ~ '^(tabs|stock):[0-9a-f-]{36}$'
        and split_part(realtime.topic(), ':', 2)::uuid = (select app.current_venue())
        and (select app.staff_role()) is not null
      )
  $p$;
end $rt_policies$;
