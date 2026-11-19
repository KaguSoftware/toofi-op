-- 0005 audit_log (append-only) and app.write_audit, the single insert path.
-- Every sensitive action records who did it, who authorized it and why.

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  actor_id      uuid,                    -- auth.uid() of the caller; NULL for system writes
  authorized_by uuid,                    -- the manager whose PIN authorized it, if any
  action        text not null,           -- e.g. 'order_item.void', 'staff.pin_set'
  entity        text not null,           -- e.g. 'order_items', 'staff'
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);

create index audit_log_entity on audit_log (entity, entity_id);
create index audit_log_venue_created on audit_log (venue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- app.write_audit: internal (no client grant). Called from definer functions,
-- so auth.uid() is still the original caller. Never pass PIN material.
-- ---------------------------------------------------------------------------
create or replace function app.write_audit(
  p_action        text,
  p_entity        text,
  p_entity_id     uuid default null,
  p_before        jsonb default null,
  p_after         jsonb default null,
  p_reason        text default null,
  p_authorized_by uuid default null
) returns uuid
language sql security definer set search_path = public as $write_audit$
  insert into audit_log (actor_id, authorized_by, action, entity, entity_id, before, after, reason)
  values (auth.uid(), p_authorized_by, p_action, p_entity, p_entity_id, p_before, p_after, p_reason)
  returning id
$write_audit$;

revoke all on function app.write_audit(text, text, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;

-- Append-only: no UPDATE/DELETE/TRUNCATE grant for anyone, plus the trigger.
revoke all on audit_log from anon, authenticated;
revoke update, delete, truncate on audit_log from service_role;
create trigger audit_log_append_only
  before update or delete or truncate on audit_log
  for each statement execute function app.forbid_mutation();

-- RLS: manager and owner of the venue read; nobody writes directly.
alter table audit_log enable row level security;
grant select on audit_log to authenticated;
create policy audit_log_manager_read on audit_log for select to authenticated
  using (venue_id = (select app.current_venue()) and (select app.is_staff('manager', 'owner')));
