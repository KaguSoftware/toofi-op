# Spec: Restaurant Operator v1

## Scope
| In v1 | Not in v1 |
|---|---|
| Waiters: floor plan, open a tab on a table, order, send, transfer and merge tabs, void a line (manager PIN once sent) | Kitchen printing, kitchen screens (KDS) |
| Cashier: open tabs, bill, cash/card, part payment, split evenly or by item, change, receipt print, till shift with blind count | Card terminal integration (the cashier types in the approved amount) |
| Manager: business day open and close, discounts, refunds, analytics panel, menu/floor/staff admin | Offline mode (writes carry idempotency keys, so it can be added later) |
| Stock: ingredients, recipes, sales deduct stock automatically, deliveries, waste, counts, low-stock list, margins | Batches/expiry, multiple stores, supplier ordering |
| EN + AR (RTL), IQD, Asia/Baghdad | Multi-branch UI (the schema is ready for it) |
| Guest QR menu: a guest scans the table's code, browses the menu, calls a waiter, or sends an order that staff accept | Paying from the phone, the guest seeing the bill, the guest cancelling an accepted order, photos and descriptions |

## Roles
`waiter`, `cashier`, `manager`, `owner`. Each listed role also gets everything granted to the roles to its left, except where noted.

| Capability | waiter | cashier | manager | owner |
|---|---|---|---|---|
| See the floor, open tabs, add items, transfer/merge their own open tabs | ✓ | ✓ | ✓ | ✓ |
| Void an unsent line (there are no unsent lines on the server; the basket is client-side) | n/a | | | |
| Void a sent line | PIN | PIN | ✓ (own PIN still recorded) | ✓ |
| Take payments, settle, split, drawer, own till shift | | ✓ | ✓ | ✓ |
| Discount, refund, cancel a non-empty tab, close another person's shift | | PIN | ✓ | ✓ |
| Open and close the business day, analytics, stock | | | ✓ | ✓ |
| Admin for menu, floor and stock items | | | ✓ | ✓ |
| Staff admin, venue settings, set PINs | | | | ✓ |
| Answer a waiter call, accept or decline a guest order | ✓ | ✓ | ✓ | ✓ |
| Print table QR cards, switch guest calls or guest ordering on and off (whole venue or one table) | | | ✓ | ✓ |
| Replace a table's QR code | | | | ✓ |

"PIN" means the action needs a **manager PIN** (from a manager or owner) through `verify_manager_pin` → `consume_pin_grant`. When the actor is a manager or owner, the function records them as the authorizer with no extra PIN.

A **guest** has no role and no login. Guests reach only the five guest functions, through a table link or a table session.

## Core flows
1. **Day.**
   - A manager runs `open_day`. Without an open day, `open_tab` raises `DAY_NOT_OPEN`.
   - `close_day` is refused while any tab is open (`OPEN_TABS_EXIST`). It also stores a summary snapshot: gross, discounts, refunds, net, cash, card, voids and covers.
2. **Tab.**
   - A waiter taps a free table and calls `open_tab(table_id, covers, idem)`.
   - A table can have one open tab at a time (`TABLE_OCCUPIED`), enforced by a partial unique index.
3. **Order.**
   - The basket lives on the client. **Send** calls `add_items(tab_id, items jsonb, idem)`, which creates one `orders` row and its `order_items` with price snapshots taken from the menu at that moment.
   - `items` is `[{menu_item_id, qty, modifier_ids[], note}]`.
   - Stock is deducted by a trigger, using the recipe at the time of the sale.
4. **Bill.**
   - `app.compute_tab_totals(tab_id)` returns `{subtotal, discount, tax, total, paid, due}`. Prices include tax: tax is extracted per tax group, and the discount is spread across lines in proportion to their value.
5. **Pay.**
   - `settle_tab(tab_id, method, amount, tendered, idem)` records a payment, with part payments allowed. Change is `tendered - amount` for cash.
   - When `due` reaches 0 the tab becomes `settled` and the table is freed.
   - `split_evenly(tab, n)` and `split_by_item(tab, line_ids)` return the amounts for each share; each share is then paid with `settle_tab`.
6. **Shift.**
   - The cashier opens a `till_shift` with an opening float before the first cash payment. The client blocks cash payments until then; the server does not, so money is never refused.
   - Payments are stamped with the open shift for their device.
   - Close takes a blind count, and the variance is recorded.
7. **Stock.**
   - A sale writes a `sale` movement for each recipe line; voiding a line writes a `void_return`.
   - Stock is adjusted only by `finalize_count` (`count_adjust`), `record_waste` (`waste`) and `receive_delivery` (`delivery`).
   - On-hand = the sum of movements. It may go negative. When on-hand drops to or below `reorder_point`, a low-stock entry appears in the `v_low_stock` view.
8. **Guest.**
   - A guest scans the QR code on a table. The guest site calls `open_table_session(token)` and gets a table session. The guest sees the menu from `guest_menu()` in Arabic or English.
   - The guest taps a reason and calls a waiter (`raise_waiter_call`), or sends a basket (`send_guest_order`). The server prices the lines and ignores any price the client sends. The order waits as `pending` in `guest_orders`; no tab, order or stock row exists yet.
   - Every operator screen shows the open calls and pending orders (`guest_inbox`). Staff tap **OK** on a call (`answer_waiter_call`).
   - For an order, staff tap **OK** (`accept_guest_order(id, covers, idem)`) or **Decline** (`decline_guest_order`). Accept opens a tab with `open_tab` if the table is free (covers are then required) and adds the lines with `add_items`, as the staff member who accepted. Pricing, audit and stock then work as for a waiter's order.
   - The guest's phone shows the result through `guest_status`.
   - A table has one open call at a time, and a new call waits 120 seconds after the last one was raised. A table can hold 3 pending orders. Without an open business day, guest calls and orders raise `DAY_NOT_OPEN`.
   - A pending order whose business day has closed reads as `expired` to the guest and can no longer be accepted (`GUEST_ORDER_EXPIRED`). The status is derived; `close_day` does not touch `guest_orders`.

## Schema contract (Phase 0 creates all tables; Phase 1 adds functions, triggers and views; the guest tables arrive later, in band 0140+)
Enums: `staff_role(waiter,cashier,manager,owner)`, `tab_status(open,settled,void)`, `payment_method(cash,card)`, `stock_unit(g,ml,pc)`, `movement_kind(delivery,sale,void_return,waste,count_adjust)`, `adjustment_kind(discount_percent,discount_amount)`, `waiter_call_reason(order,bill,water,help)`, `guest_order_status(pending,accepted,declined)`.

Unless noted, every table has `id uuid pk default gen_random_uuid()`, `venue_id uuid not null default app.current_venue()` and `created_at timestamptz not null default now()`.

- **Venue and staff:**
  - `venues` (name, timezone default `Asia/Baghdad`).
  - `venue_settings` (venue_id pk, currency `IQD`, receipt_header_en/ar, receipt_footer_en/ar, service_charge_bps default 0, variance_alert_iqd default 5000).
  - `staff` (id = auth.users.id pk, venue_id, full_name, role, pin_hash, is_active).
- **System:**
  - `audit_log` (actor_id, authorized_by, action, entity, entity_id, before jsonb, after jsonb, reason).
  - `app.rpc_replays` (key pk, actor_id, result jsonb).
  - `app.pin_grants` (id, actor_id, authorizer_id, action, entity_id, value, expires_at, consumed_at).
  - `app.pin_attempts` (staff_id/actor, ok, at).
- **Floor:**
  - `floor_areas` (name_en, name_ar, sort).
  - `dining_tables` (area_id, label, seats, grid_x, grid_y, is_active). It is named `dining_tables` because `tables` is too generic.
- **Menu:**
  - `tax_groups` (name, rate_bps).
  - `menu_categories` (name_en, name_ar, sort, is_active).
  - `menu_items` (category_id, name_en, name_ar, price iqd, tax_group_id, is_active, sort).
  - `modifier_groups` (name_en, name_ar, min_select, max_select).
  - `modifiers` (group_id, name_en, name_ar, price_delta iqd_signed, is_active).
  - `menu_item_modifier_groups` (menu_item_id, group_id, pk both).
- **Service:**
  - `day_sessions` (business_date, opened_by, opened_at, closed_by, closed_at, summary jsonb; unique on venue + business_date).
  - `tabs` (day_session_id, table_id null, waiter_id, covers, status, opened_at, closed_at, merged_into_tab_id, note, idempotency_key unique).
  - `orders` (tab_id, placed_by, placed_at, idempotency_key unique).
  - `order_items` (order_id, tab_id, menu_item_id, name_en, name_ar, unit_price iqd, qty int, line_total iqd, tax_rate_bps, note, voided_at, voided_by, void_reason, void_authorized_by).
  - `order_item_modifiers` (order_item_id, modifier_id, name_en, name_ar, price_delta).
- **Money:**
  - `tab_adjustments` (tab_id, kind, value, amount iqd, reason, applied_by, authorized_by).
  - `payments` (tab_id, method, amount iqd, tendered iqd null, change iqd, taken_by, till_shift_id null, device_id, idempotency_key unique).
  - `refunds` (payment_id, tab_id, amount, method, reason, refunded_by, authorized_by, till_shift_id).
  - `till_shifts` (staff_id, device_id, opened_at, opening_float, closed_at, counted_cash, expected_cash, variance iqd_signed, closed_by).
  - `drawer_events` (till_shift_id, staff_id, reason).
- **Stock:**
  - `ingredients` (name_en, name_ar, unit, reorder_point numeric, cost_per_unit numeric(14,4), is_active).
  - `recipe_lines` (menu_item_id, ingredient_id, qty numeric(12,3); unique on the pair).
  - `suppliers` (name, phone).
  - `deliveries` (supplier_id null, received_by, received_at, note, idempotency_key).
  - `delivery_lines` (delivery_id, ingredient_id, qty, unit_cost).
  - `stock_counts` (started_by, started_at, finalized_by, finalized_at).
  - `stock_count_lines` (count_id, ingredient_id, expected, counted, on_hand_at_save; expected and on_hand_at_save are not client-readable).
  - `stock_movements` (ingredient_id, kind, qty numeric signed, unit_cost, ref_table, ref_id, actor_id).
- **Guest QR menu** (added in band 0140+):
  - `venue_settings` gains `guest_calls_enabled boolean not null default true` and `guest_orders_enabled boolean not null default true`.
  - `table_links` (table_id unique, token text unique not null, guest_enabled default true, rotated_at). One row per `dining_tables` row, created by an insert trigger. The token is 16 random bytes as base64url (22 characters).
  - `app.guest_sessions` (id, table_id, last_activity_at, expires_at, closed_at). The id is the guest's bearer credential. A session lives 90 minutes from its last activity.
  - `waiter_calls` (table_id, day_session_id, guest_session_id null, reason, called_at, answered_at, answered_by, idempotency_key; unique on table + day session where `answered_at` is null; unique on guest session + idempotency key).
  - `guest_orders` (table_id, day_session_id, guest_session_id null, status, items jsonb, quote jsonb, quoted_total iqd, sent_at, decided_at, decided_by, tab_id null, order_id null, idempotency_key; unique on guest session + idempotency key). `items` has the same shape as `add_items` input.

Every table has RLS enabled and a select policy for any active staff at the venue (`app.staff_role() is not null`), except:
- `audit_log` and `till_shifts` of other staff: manager and above.
- `ingredients` cost columns: these are readable by all staff in v1, which is accepted.
- `table_links.token`: not client-readable (a column grant leaves it out, like `staff.pin_hash`). Managers and owners read tokens only through `app.table_qr_tokens()`.
- `app.guest_sessions`: no client grants at all, like `app.pin_grants`.

## Migration number bands (filename `2026112000NNNN_<name>.sql`)
| Band | Owner | Content |
|---|---|---|
| 0001–0019 | Phase 0 | Extensions, domains, app schema, helpers, all tables, RLS select policies, audit, replay, PIN functions |
| 0020–0039 | backend-money | Day, tab, order, payment, split, discount, refund, shift functions and `compute_tab_totals` |
| 0040–0059 | backend-stock-analytics | Stock triggers, stock functions, views, analytics/report functions, realtime broadcast triggers |
| 0060–0079 | backend-catalog-seed | Floor/menu/modifier/tax/staff admin functions, plus `supabase/seed.sql` |
| 0080–0139 | fixes after Phase 1 | |
| 0140+ | guest QR menu | Guest enums, `table_links`, `app.guest_sessions`, `waiter_calls`, `guest_orders`, guest and staff functions, realtime signals, housekeeping |

Each agent also owns its own test files `packages/db/tests/<area>.test.ts` and appends its entries to `rls-matrix.ts` and `ERROR_CODE_KEYS`. Those last two are shared files: **append only**, under a comment header with the agent's name, and the orchestrator resolves merge conflicts.

## Brand
`brand.config.json`: `{ productName, appId, packageScope, releasesOwner, releasesRepo, installerName, protocolPrefix }`. Placeholders: "Restaurant Operator", `com.kagu.restaurant.operator`, `@rop`, prefix `rop`.
