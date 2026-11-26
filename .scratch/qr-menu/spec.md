# QR menu: table ordering and call waiter

Status: ready-for-agent

Decided with the owner on 2026-11-25. This file is the contract for every step. If the code has to differ from it, change this file in the same piece of work and say so in your report.

## What it does

1. A guest scans the QR code on a table and sees the menu in Arabic or English. There is no login.
2. The guest can **call a waiter** (reason: order, bill, water or help) or **send an order** from a basket.
3. Staff get an alert on every screen of the operator app.
4. Staff tap **OK**. For an order they can tap **Decline** instead. The guest's phone shows the result.

**Nothing reaches a tab, money or stock until a staff member taps OK.** A guest order is a request held in `guest_orders`. Accepting it runs the existing `app.open_tab` (when the table is free) and `app.add_items` as the accepting staff member, so pricing, audit, stock deduction and realtime all behave as they do for a waiter's order.

Not included: paying from the phone, showing the bill to the guest, the guest cancelling an accepted order, dish descriptions, kitchen tickets.

Start with `README.md` in this folder. The approved look is in `design.md`.

## Owner decisions

- **Rule 1 exception.** The five guest functions are callable without a staff login. Their first check is a valid table link token or a live table session, not `app.is_staff(...)`. Every other function keeps the staff check.
- **Staff confirm every order.** No guest write may insert into `tabs`, `orders`, `order_items` or `stock_movements`.
- **One tap answers a call** ("OK"). There is no second "done" step.
- Managers print QR cards and use the off switches. Only the owner replaces a table's code.

## Steps

| Step | Work | Ticket |
|---|---|---|
| 1 | Database for calls and guest orders, guardrails, error text, docs (the "Database" section below) | done, see `issues/01-commit-database-step.md` |
| 2 | Dish photos and category icons in the database, file storage | `issues/02-photos-and-icons-db.md` |
| 3 | Shared tokens; guest site `apps/menu` (Next.js, adapted from `../TouchPadel/apps/web`): session, routes, data | `issues/03-guest-site-foundation.md` |
| 4 | Guest UI: menu and call waiter | `issues/04-guest-menu-and-call.md` |
| 5 | Guest UI: basket, order, status | `issues/05-guest-basket-and-order.md` |
| 6 | Staff app: alerts on every screen, sound, OK and Decline, floor badge | `issues/06-staff-inbox.md` |
| 7 | Staff app: QR cards, switches, photo upload, icon picker | `issues/07-staff-setup-screens.md` |
| 8 | End-to-end tests, docs, CI, hosting notes | `issues/08-e2e-docs-hosting.md` |

The guest site talks to the database only from its server, with the anon key. The table session id lives in an HttpOnly cookie. The browser never calls Supabase.

Design decisions made on 2026-11-26 (details in `design.md`): the site follows the phone's light or dark setting; every dish has a photo and every category an icon; dishes sit on solid white rows with one green scroll ornament; one curved corner ornament replaces the all-over pattern.

## Database (step 1)

Migrations start at `20261120000140_`. Follow every backend rule in `CLAUDE.md` except where "Owner decisions" above says otherwise.

### Enums (own migration, first)

- `waiter_call_reason`: `order`, `bill`, `water`, `help`
- `guest_order_status`: `pending`, `accepted`, `declined`

### Tables

Every table: `venue_id uuid not null default app.current_venue()`, `created_at`, RLS enabled. Guest functions must set `venue_id` explicitly from the table's row; never rely on the default for a guest caller.

| Table | Columns | Access |
|---|---|---|
| `table_links` | `table_id` unique → `dining_tables`, `token text` unique not null, `guest_enabled boolean not null default true`, `rotated_at` | Staff of the venue may select every column **except `token`** (column grant, like `staff.pin_hash`). The token is read only through `app.table_qr_tokens()`. |
| `app.guest_sessions` | `id` (the bearer credential, random uuid), `table_id`, `last_activity_at`, `expires_at`, `closed_at` | No client grants at all, like `app.pin_grants`. |
| `waiter_calls` | `table_id`, `day_session_id`, `guest_session_id` null (on delete set null), `reason`, `called_at`, `answered_at`, `answered_by` → `staff`, `idempotency_key` | Select for any active staff of the venue. |
| `guest_orders` | `table_id`, `day_session_id`, `guest_session_id` null (on delete set null), `status`, `items jsonb` (the request: `[{menu_item_id, qty, modifier_ids[], note}]`, already validated and cleaned), `quote jsonb` (server-priced lines for display), `quoted_total iqd`, `sent_at`, `decided_at`, `decided_by` → `staff`, `tab_id` null, `order_id` null, `idempotency_key` | Select for any active staff of the venue. |

- `venue_settings` gains `guest_calls_enabled boolean not null default true` and `guest_orders_enabled boolean not null default true`.
- A token is 16 random bytes, base64url, 22 characters. It is stored, not signed.
- Every `dining_tables` row has a `table_links` row: an insert trigger creates it, and the migration backfills existing tables.
- One open call per table per business day: unique index on `waiter_calls (table_id, day_session_id) where answered_at is null`.
- Replays: unique `(guest_session_id, idempotency_key)` on `waiter_calls` and on `guest_orders`.

### Guest functions (granted to `anon` only)

Guest functions do **not** use `app.claim_replay`: it tells callers apart by `auth.uid()`, which is NULL for every guest, so one guest could read another's result. They replay through the unique `(guest_session_id, idempotency_key)` instead, and still raise `IDEMPOTENCY_KEY_REQUIRED` for a blank key.

A session is live when `closed_at is null and expires_at > now()`, its table is active, and its table link has not been rotated since the session was opened (rotation closes sessions, so the first test is enough). A live session slides `expires_at` to now + 90 minutes on `open_table_session`, `raise_waiter_call` and `send_guest_order`. `guest_status` is read-only and does not slide it.

| Function | Returns | Rules |
|---|---|---|
| `app.guest_menu()` | `{venue: {name}, categories: [{id, name_en, name_ar, sort, items: [{id, name_en, name_ar, price, sort, modifier_groups: [{id, name_en, name_ar, min_select, max_select, modifiers: [{id, name_en, name_ar, price_delta}]}]}]}]}` | Stable. The single venue's active categories, active items and active modifiers, in sort order. Never cost, recipe, stock or tax data. |
| `app.open_table_session(p_token text)` | `{session_id, table_label, expires_at, calls_enabled, orders_enabled, day_open}` | Unknown token or inactive table: `TABLE_LINK_INVALID` (never say which). More than 30 new sessions for one table in a minute: `TOO_MANY_REQUESTS`. |
| `app.raise_waiter_call(p_session_id uuid, p_reason waiter_call_reason, p_idempotency_key text)` | `{call_id, status: 'waiting', reason, called_at, already}` | Order of checks: live session (`SESSION_EXPIRED`) → replay by key → calls switched on for the venue and the table (`GUEST_CALLS_OFF`) → an open business day (`DAY_NOT_OPEN`) → the table already has an open call today: return it with `already: true` → the table's last call today was raised under 120 seconds ago: `CALL_TOO_SOON` → insert. |
| `app.send_guest_order(p_session_id uuid, p_items jsonb, p_idempotency_key text)` | `{guest_order_id, status: 'pending', lines, total, sent_at}` | Live session → replay by key → ordering switched on for the venue and the table (`GUEST_ORDERS_OFF`) → open business day → validation → the table has 3 pending orders today: `TOO_MANY_PENDING_ORDERS` → insert. Validation: 1 to 40 lines (`ITEMS_REQUIRED`, `TOO_MANY_ITEMS`); integer qty 1 to 20 (`INVALID_QTY`); item and its category active (`ITEM_NOT_AVAILABLE`); modifiers exactly as `app.add_items` checks them (`MODIFIER_NOT_ALLOWED`, `MODIFIER_SELECTION_INVALID`). Any price a client sends is ignored. Notes are cleaned by the server: control and bidi-override characters removed, whitespace collapsed, cut to 140 characters. |
| `app.guest_status(p_session_id uuid)` | `{table_label, expires_at, day_open, calls_enabled, orders_enabled, call, call_again_at, orders}` | Stable. `SESSION_EXPIRED` for a dead session. `call` is the table's open call today, else this session's latest call today, else null: `{id, reason, status: 'waiting' \| 'answered', called_at, answered_at}`. `call_again_at` is when the 120 seconds end, or null. `orders` are this session's orders only, newest first: `{id, status, sent_at, lines, total}`, where a `pending` order whose business day has closed reads as `expired`. |

### Staff functions (granted to `authenticated`, role check first, listed in `rls-matrix.ts`)

| Function | Roles | Behaviour |
|---|---|---|
| `app.guest_inbox()` | all staff | Stable. `{calls: [...], orders: [...]}` for the open business day: open calls and pending orders, oldest first, each with `table_id` and `table_label`. Each order carries its sent `lines` and `total`, plus `current_total`, `price_changed` and `unavailable` from re-pricing its `items` against the menu now, and `table_has_tab`. |
| `app.answer_waiter_call(p_call_id uuid)` | all staff | Sets `answered_at`, `answered_by`. A second tap returns `{already: true}` and changes nothing. Unknown or other venue: `WAITER_CALL_NOT_FOUND`. |
| `app.accept_guest_order(p_guest_order_id uuid, p_covers int, p_idempotency_key text)` | all staff | `app.claim_replay` as usual. Pending only: an already accepted order returns its stored result with `already: true`; a declined one raises `GUEST_ORDER_NOT_PENDING`; one from a closed business day raises `GUEST_ORDER_EXPIRED`. If the table has no open tab, `p_covers` is required (`COVERS_REQUIRED`) and the function calls `app.open_tab`; then it calls `app.add_items` with the stored `items`. Both nested calls get keys derived from `p_idempotency_key`. Stores `tab_id`, `order_id`, `decided_at`, `decided_by`; audits `guest_order.accept`. Returns `{guest_order_id, status, tab_id, order_id, totals, already}`. If `add_items` raises (an item went inactive), the whole call rolls back and the error reaches the staff member, who then declines. Two staff accepting two orders for the same free table at once must both succeed onto one tab: serialize per table (an advisory transaction lock on the table id is fine). |
| `app.decline_guest_order(p_guest_order_id uuid)` | all staff | Pending → declined, audited. Already declined: `{already: true}`. Accepted: `GUEST_ORDER_NOT_PENDING`. |
| `app.table_qr_tokens()` | manager, owner | `[{table_id, label, area_id, token, guest_enabled}]` for active tables, ordered for print. One audit row per call. |
| `app.set_table_guest_enabled(p_table_id uuid, p_enabled boolean)` | manager, owner | Audited. |
| `app.set_guest_service(p_calls_enabled boolean, p_orders_enabled boolean)` | manager, owner | Writes the two `venue_settings` columns. Audited. |
| `app.rotate_table_token(p_table_id uuid)` | owner | New token, `rotated_at = now()`, closes every live session of the table. Audited. Does not return the token. |

### Other rules

- **Lock order** becomes `day_sessions → guest_orders → waiter_calls → tabs → orders → order_items → …` (the rest unchanged).
- **Realtime.** Inserts and updates on `waiter_calls` and `guest_orders` send the existing refetch signal on the `tabs:<venue>` topic through `app.rt_signal('tabs')`. No new topic and no new realtime policy.
- **Housekeeping.** A new migration recreates `app.purge_housekeeping()` so it also deletes guest sessions that expired or closed more than one day ago.
- **Error codes.** Every new code goes in `ERROR_CODE_KEYS` with English and natural Arabic text: `TABLE_LINK_INVALID`, `SESSION_EXPIRED`, `TOO_MANY_REQUESTS`, `GUEST_CALLS_OFF`, `GUEST_ORDERS_OFF`, `CALL_TOO_SOON`, `WAITER_CALL_NOT_FOUND`, `TOO_MANY_ITEMS`, `TOO_MANY_PENDING_ORDERS`, `GUEST_ORDER_NOT_FOUND`, `GUEST_ORDER_NOT_PENDING`, `GUEST_ORDER_EXPIRED`, `COVERS_REQUIRED`. Reuse existing codes where one already fits. Guest-facing lines are read by a diner, so they must not mention staff tools.
- **Guardrails.** `check:rpc-registry` must also fail on any `app.*` function granted to `anon` that is not in a new public list with a reason (`packages/db/fixtures/rpc-public.json`). A database test must prove that `anon` can execute exactly the five guest functions and can select no table.

### Step 1 is done when

- Tests were written first and pass against the local stack (not skipped).
- No guest write creates a `tabs`, `orders`, `order_items` or `stock_movements` row; accepting does, exactly once, even on a double tap or two staff at once.
- Limits, switches, cooldown, expiry and replay all hold under test.
- `pnpm --filter @rop/db check:error-codes` and `check:rpc-registry` pass; `pnpm typecheck` and `pnpm lint` pass; types are regenerated.

### As built (step 1): decisions and deviations

Migrations `0140_guest_enums`, `0141_guest_tables`, `0142_guest_functions`, `0143_guest_staff_functions`, `0144_guest_housekeeping`. Where this section and the tables above differ, this section is what the database does.

- **Per-table lock.** `raise_waiter_call`, `send_guest_order` and `accept_guest_order` take a transaction advisory lock on the table (`app.lock_guest_table`) right after the day row. Full lock order: `day_sessions → (table lock) → guest_orders → waiter_calls → tabs → …`. `open_table_session` takes `table_links … for update` on the table's link, so session opens and a rotation run one at a time.
- **Replay under the lock.** Guest writes check `(guest_session_id, idempotency_key)` before the switches (as specified) and again after taking the table lock, so the same key sent twice at once still returns the first result.
- **"Today"** means the open business day, for `raise_waiter_call`, `guest_status` and `guest_inbox`.
- **`table_links`** also has an `id uuid` primary key; `table_id` is unique.
- **`guest_menu`** leaves out an active category that has no active item. Modifier groups and modifiers have no sort column, so they come in creation order.
- **Validation details.** A malformed menu item id is `ITEM_NOT_AVAILABLE` and a malformed modifier id or non-array `modifier_ids` is `MODIFIER_NOT_ALLOWED` (not the native `22P02` that `add_items` gives). A negative unit price is `INVALID_PRICE`, as in `add_items`. A null `p_reason` is `INVALID_ARGUMENT` (checked after the replay, before the switches). Note cleaning also removes U+200E, U+200F and U+061C (direction marks), and treats non-breaking and other Unicode spaces as whitespace; a note that is not a JSON string becomes null.
- **Return shapes the tables above leave open:**
  - quote line (`lines` everywhere): `{menu_item_id, name_en, name_ar, qty, unit_price, line_total, note, modifiers: [{id, name_en, name_ar, price_delta}]}`.
  - `raise_waiter_call` replay returns the original result (`status: 'waiting'`, `already: false`) even if the call was answered since.
  - `send_guest_order` replay returns the original result (`status: 'pending'`).
  - `guest_inbox` call: `{id, table_id, table_label, reason, called_at}`; order: `{id, table_id, table_label, sent_at, lines, total, current_total, price_changed, unavailable, table_has_tab}`. `current_total` is null when `unavailable`.
  - `answer_waiter_call` → `{call_id, status: 'answered', answered_at, answered_by, already}`. Not audited (no money or authorization involved).
  - `accept_guest_order` on an already accepted order: the stored `tab_id` and `order_id`, with `totals` computed for that tab **now** (not a snapshot from the accept).
  - `decline_guest_order` → `{guest_order_id, status: 'declined', already}`. A pending order from a closed day can still be declined.
  - `set_table_guest_enabled` → `{table_id, guest_enabled}`; null flag is `ACTIVE_FLAG_REQUIRED`; unknown table is `TABLE_NOT_FOUND`.
  - `set_guest_service` → `{calls_enabled, orders_enabled}`; a null argument is `INVALID_ARGUMENT`.
  - `rotate_table_token` → `{table_id, rotated_at, sessions_closed}`; unknown table is `TABLE_NOT_FOUND`.
- **Audit actions:** `guest_order.accept`, `guest_order.decline`, `table_link.read_tokens`, `table_link.set_guest_enabled`, `table_link.rotate`, `venue_settings.guest_service`. No audit row ever holds a token.
- **Reused codes with staff wording.** Guests can meet `DAY_NOT_OPEN` ("Ask a manager to open it"), `INVALID_QTY` ("1 to 999"; the guest limit is 20), `ITEM_NOT_AVAILABLE`, `MODIFIER_*`, `INVALID_PRICE` ("Check the menu setup"), `IDEMPOTENCY_KEY_REQUIRED` and `INVALID_ARGUMENT`. Their catalogue text is unchanged because the operator app uses it; the guest site (step 2) should map them to diner wording with `errorMessageKey` overrides.
- **Known edge.** If a waiter opens a tab on the table while an accept for a free table is running, the accept fails with `TABLE_OCCUPIED` (the waiter's `open_tab` does not take the table lock); a retry lands on the waiter's tab.
