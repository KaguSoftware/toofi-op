-- 0010 money tables: adjustments, till shifts, payments, refunds, drawer events.
-- DDL only: payment, split, discount, refund and shift functions belong to the
-- money phase. payments and refunds are append-only (no UPDATE/DELETE grant for
-- anyone, plus app.forbid_mutation); a correction is always a new row.

-- A discount on a tab. value: percent in basis points (discount_percent) or IQD
-- (discount_amount); amount: the IQD it took off when applied.
create table tab_adjustments (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  tab_id        uuid not null references tabs (id),
  kind          adjustment_kind not null,
  value         bigint not null check (value >= 0),
  amount        iqd  not null,
  reason        text not null check (btrim(reason) <> ''),
  applied_by    uuid not null references staff (id),
  authorized_by uuid references staff (id),
  created_at    timestamptz not null default now(),
  check (kind <> 'discount_percent' or value <= 10000)
);
create index tab_adjustments_tab on tab_adjustments (tab_id);

-- One cashier's drawer session: opening float -> blind count -> variance.
create table till_shifts (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  staff_id      uuid not null references staff (id),
  device_id     text not null check (btrim(device_id) <> ''),
  opened_at     timestamptz not null default now(),
  opening_float iqd  not null,
  closed_at     timestamptz,
  counted_cash  iqd,
  expected_cash iqd,
  variance      iqd_signed,                  -- counted_cash - expected_cash
  closed_by     uuid references staff (id),
  created_at    timestamptz not null default now(),
  check ((closed_at is null) = (closed_by is null)),
  check (closed_at is null or (counted_cash is not null and expected_cash is not null
                               and variance = counted_cash - expected_cash))
);
-- One open shift per device: payments are stamped with the open shift for their device.
create unique index till_shifts_one_open_per_device on till_shifts (venue_id, device_id) where closed_at is null;
create index till_shifts_staff on till_shifts (staff_id);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null default app.current_venue() references venues (id),
  tab_id          uuid not null references tabs (id),
  method          payment_method not null,
  amount          iqd  not null check (amount > 0),
  tendered        iqd,                       -- cash handed over; NULL for card
  change          iqd  not null default 0,   -- tendered - amount for cash
  taken_by        uuid not null references staff (id),
  till_shift_id   uuid references till_shifts (id),
  device_id       text,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  check (method = 'cash' or (tendered is null and change = 0)),
  check (tendered is null or (tendered >= amount and change = tendered - amount)),
  check (tendered is not null or change = 0)
);
create index payments_tab on payments (tab_id);
create index payments_till_shift on payments (till_shift_id);
create index payments_venue_created on payments (venue_id, created_at);

create table refunds (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  payment_id    uuid not null references payments (id),
  tab_id        uuid not null references tabs (id),
  amount        iqd  not null check (amount > 0),
  method        payment_method not null,
  reason        text not null check (btrim(reason) <> ''),
  refunded_by   uuid not null references staff (id),
  authorized_by uuid references staff (id),
  till_shift_id uuid references till_shifts (id),
  created_at    timestamptz not null default now()
);
create index refunds_payment on refunds (payment_id);
create index refunds_tab on refunds (tab_id);
create index refunds_till_shift on refunds (till_shift_id);
create index refunds_venue_created on refunds (venue_id, created_at);

-- The drawer opened without a sale ("no sale"), with a reason.
create table drawer_events (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null default app.current_venue() references venues (id),
  till_shift_id uuid not null references till_shifts (id),
  staff_id      uuid not null references staff (id),
  reason        text not null check (btrim(reason) <> ''),
  created_at    timestamptz not null default now()
);
create index drawer_events_till_shift on drawer_events (till_shift_id);

-- ---------------------------------------------------------------------------
-- Append-only: payments and refunds.
-- ---------------------------------------------------------------------------
revoke update, delete, truncate on payments, refunds from service_role;
create trigger payments_append_only
  before update or delete or truncate on payments
  for each statement execute function app.forbid_mutation();
create trigger refunds_append_only
  before update or delete or truncate on refunds
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS: select-only for active staff of the venue; till shifts of other staff
-- for managers and owners only. No client writes.
-- ---------------------------------------------------------------------------
do $rls_0010$
declare
  t text;
begin
  foreach t in array array['tab_adjustments', 'payments', 'refunds', 'drawer_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (venue_id = (select app.current_venue()) and (select app.staff_role()) is not null)',
      t || '_staff_read', t);
  end loop;
end $rls_0010$;

alter table till_shifts enable row level security;
revoke all on till_shifts from anon, authenticated;
grant select on till_shifts to authenticated;
create policy till_shifts_own_or_manager_read on till_shifts for select to authenticated
  using (venue_id = (select app.current_venue())
         and (select app.staff_role()) is not null
         and (staff_id = (select auth.uid()) or (select app.is_staff('manager', 'owner'))));
