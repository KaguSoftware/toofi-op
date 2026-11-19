-- 0002 money domains and every enum in docs/SPEC.md (schema contract).
-- A new enum value goes in its own migration, before its first use.

-- Money is an integer number of IQD. Never numeric or float.
create domain iqd as bigint check (value >= 0);  -- amounts
create domain iqd_signed as bigint;              -- deltas and variances

create type staff_role      as enum ('waiter', 'cashier', 'manager', 'owner');
create type tab_status      as enum ('open', 'settled', 'void');
create type payment_method  as enum ('cash', 'card');
create type stock_unit      as enum ('g', 'ml', 'pc');
create type movement_kind   as enum ('delivery', 'sale', 'void_return', 'waste', 'count_adjust');
create type adjustment_kind as enum ('discount_percent', 'discount_amount');
