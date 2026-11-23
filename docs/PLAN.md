# Plan: Kagu Restaurant, from v1 to a venue-ready product

Status: in progress. Decided and started on 2026-11-21; see the progress table below.
"Kagu Restaurant" is the working name, set in `brand.config.json`.

Read with: `docs/SPEC.md` (v1 behaviour), `HANDOFF.md` (current state and pre-launch checklist), `CLAUDE.md` (rules), `docs/DESIGN-RESEARCH.md` (design direction for phase 4).

## 0. Progress

| Item | State |
|---|---|
| 0.1 Rename to Kagu Restaurant | Done. `productName` only; app ID, installer name and `@rop` scope unchanged. |
| 0.2 Design direction and `PRODUCT.md` | Done. The owner delegated the choice; the recommendation was adopted. |
| 0.5 Frontend rule in `CLAUDE.md` | Done. |
| 4.1 Foundations | Done: measured OKLCH tokens, bundled IBM Plex Sans (Latin and Arabic), role-based rail or bar, kit states. Not done: skeleton loading, offline banner, phone bottom bar. |
| 4.2 Order screen | Done: three zones, full-height layout, one-tap add, quantity badges, pinned amount due. Not done: sold-out state (needs 2.3). |
| 4.3 Floor | Done: fill, label and time. Not done: own-table emphasis, time warning, takeaway list (needs 1.3). |
| 4.4 Till and shift | Done: three panes, joined switches, large due and change. Shift screen is only lightly styled. |
| 4.5 Reports | Partly: figures strip, chart colour and direction, number formatting. The attention-first redesign waits for analytics v2 (2.6). |
| 0.3 Pilot questionnaire, 0.4 Glossary | Not started. Glossary terms are added with the features that introduce them. |
| 1.1 Cash movements | Done: `cash_movements` ledger, `record_cash_movement` with a manager PIN bound to the shift and the amount, expected cash and the day summary count them, "Cash in or out" on the shift screen. Left out on purpose until they are needed: `supplier_id` (with expenses, 3.1) and `reason_code_id` (with reason codes, 2.1). |
| 2.6 Analytics v2 | Done: eight database functions (overview with food cost, menu engineering, stock losses, staff exceptions, weekday and hour, supplier price changes, table turns, attention list) and the Reports screen with five sections (Overview, Sales, Menu, Stock, Staff), in English and Arabic. Not done: cash variance per cashier as its own trend, category mix and dead-items lists as separate views (the menu section already shows unsold items), and the daily summary message. |
| 2.5 Analytics by business day | Not done. The new functions date events by calendar day, like the existing ones, so the whole page stays consistent until all of it moves together. |
| Rest of phases 1, 2, 3, 5 | Not started. Next: 1.2 kitchen tickets. |

Demo data for the reports: `pnpm --filter @rop/db db:demo` loads three weeks of made-up trading into the local database (`packages/db/supabase/demo-history.sql`, local only). A database reset removes it, and the end-to-end tests reset the database, so run it again afterwards.

Note: a second session revised the visual design on 2026-11-21 after the first pass (softer selection, new surface tokens). `DESIGN.md` is the source of truth for how things look; the 4.x rows above describe what was built, not every later refinement.

## 1. Where v1 stands

v1 covers the core loop: floor, tabs, send, till, till shifts, stock by recipe, business day, and a sales analytics panel. Research into what operators need (sources in section 11) found three kinds of gap:

1. **Launch blockers.** A real venue cannot run a service without them: kitchen tickets, cash leaving the drawer, takeaway, and a visible answer to an internet outage.
2. **Control gaps.** The owner cannot see who gives food away or where stock goes, although most of the data is already recorded.
3. **Profit gaps.** The system reports sales but not profit, because it has no expenses and no labor cost.

The UI is also unstyled by design. Phase 4 is the design pass.

## 2. Rules every item follows

These come from `CLAUDE.md` and apply to every item below without being repeated:

- Money, stock and authorization logic is written test-first. Database tests go in `packages/db/tests/<area>.test.ts`.
- Clients never write tables. Each write is an `app.*` security-definer function with a role check first, an idempotency key where it creates a row or moves money, an audit row where it is sensitive, an entry in `rls-matrix.ts`, and its error codes in `ERROR_CODE_KEYS` with EN and AR text.
- Money is integer IQD. Ledgers are append-only.
- A new enum value gets its own migration before its first use. Committed migrations are never edited. `pnpm db:types` runs after each migration and the generated types are committed with it.
- Each screen is `XScreen.tsx` plus `xLogic.ts` plus `xLogic.test.ts`. Every string goes through `tr()` in EN and AR.
- Each item starts as `.scratch/<feature-slug>/spec.md` with numbered issues, per `docs/agents/issue-tracker.md`.
- An item is done when typecheck, lint, unit tests, database tests, `pnpm security` and the EN and AR end-to-end specs pass, and the screenshots are regenerated.

Sizes below are relative: S is about a day or two of focused work, M about a week, L more than a week.

## 3. Phase 0: decisions and groundwork

| # | Item | Size | Notes |
|---|---|---|---|
| 0.1 | Rename to "Kagu Restaurant" | S | Change `productName` in `brand.config.json`. Leave `appId`, `installerName` and the `@rop` scope alone until the final name is chosen, because changing the app ID breaks auto-update for installed tills. Rerun the end-to-end suite since the name appears on screen. |
| 0.2 | Confirm the design direction | S | Answer the three questions at the end of `docs/DESIGN-RESEARCH.md`, then write `PRODUCT.md` from the draft there. |
| 0.3 | Pilot questionnaire | S | Ask the first restaurant the questions in section 9. Several answers move items between phases. |
| 0.4 | Glossary additions | S | Add: kitchen ticket, station, order type, cash movement (paid-out, pay-in, drop), comp, sold out, reason code, expense, time entry. `GLOSSARY.md` currently lists "comp" as a word to avoid for discounts; a comp becomes its own term once 2.1 lands. |
| 0.5 | Update the frontend rule | S | `CLAUDE.md` says "no design-system work". Replace that paragraph when phase 4 starts, pointing to the new `DESIGN.md`. |

## 4. Phase 1: launch blockers

Build these in the current plain style unless phase 4.1 (tokens, shell, kit) has already landed.

### 1.1 Cash movements (M)

Today `drawer_events` stores a reason but no amount, and `expected_cash` is opening float plus cash payments minus cash refunds. The moment a cashier pays a supplier from the drawer, every shift shows a false shortage.

- **Schema:** `cash_movements` (till_shift_id, kind `paid_out | pay_in | drop`, amount iqd, reason_code_id null, note, supplier_id null, staff_id, authorized_by, idempotency_key). Append-only, like payments.
- **Functions:** `app.record_cash_movement(kind, amount, reason, note, supplier_id, idem)`. A cashier needs a manager PIN grant; a manager is recorded as their own authorizer. A new migration recreates the expected-cash calculation as float + cash payments + pay-ins − cash refunds − paid-outs − drops.
- **Day close:** the summary snapshot gains paid-outs, pay-ins and drops.
- **UI:** on `/till/shift`, a "Cash in or out" action with the amount pad and a running list for the shift. The printable day report lists them.
- **Tests first:** expected cash with each kind, PIN binding to amount, replay returns the same row, a closed shift refuses movements.

### 1.2 Kitchen tickets (L)

The tab screen says "Send to kitchen" but nothing reaches the kitchen. This is the largest item.

Constraint: waiter tablets run in a browser and cannot open a socket to a LAN printer. Only the Electron shell can print. So one Electron station (normally the till PC) acts as the print station, and tickets go through a durable queue so that none is lost or printed twice.

- **Schema:** `print_stations` (name_en, name_ar, is_active); `menu_categories.station_id` with an optional `menu_items.station_id` override; `kitchen_tickets` (order_id, station_id, kind `new | void | reprint`, status `pending | printed | failed`, claimed_by_device, claimed_at, printed_at, attempts).
- **Creation:** `add_items` writes one ticket per station in the same transaction as the order. Voiding a sent line writes a `void` ticket.
- **Printing:** the print station subscribes to realtime as a wake-up signal, claims tickets with `app.claim_kitchen_tickets(device_id)` (skip-locked, idempotent), prints, then calls `app.mark_kitchen_ticket(id, status)`. A claimed ticket that is not marked within a timeout returns to pending.
- **Shell:** `station.json` gains a printer per station. Tickets print through the existing raster path, because Arabic through ESC/POS code pages is unreliable.
- **Ticket layout:** see "Kitchen ticket" in `docs/DESIGN-RESEARCH.md`. Language is a venue setting, Arabic by default.
- **Failure states:** if any ticket is pending for more than 60 seconds, floor and till show a persistent banner ("Kitchen printer is not printing. Tell the kitchen by hand."). Managers can reprint from the tab.
- **Later:** a kitchen display reads the same `kitchen_tickets` table, so no rework is needed for a screen-based kitchen.

### 1.3 Takeaway and delivery tabs (M)

`tabs.table_id` is already nullable, but `open_tab` needs a table and the UI has no path without one.

- **Schema:** `order_type` enum `dine_in | takeaway | delivery` (own migration), `tabs.order_type`, `tabs.customer_name`, `tabs.customer_phone`.
- **Functions:** `app.open_counter_tab(order_type, customer_name, customer_phone, idem)`.
- **UI:** a "Takeaway" list beside the floor grid, with a "New takeaway" action. The till already lists open tabs; it labels the type. Kitchen tickets print the type large at the top.
- **Analytics:** covers are zero for these tabs, so spend per cover excludes them and sales split by order type.

### 1.4 Outage handling (M now, L later)

- **Now:** a global offline banner in `RootLayout` (the state is listed in `DESIGN.md` section 6 as missing); menu and floor reads served from cache while offline so screens stay readable; kitchen tickets resume from the queue when the connection returns; a printed outage procedure with paper tab pads.
- **Hardware advice for the venue:** a small UPS on the router, till PC and printers, and a 4G failover on the router. This is cheaper than software and covers most short cuts.
- **Later (5.1):** a real offline queue for sends. Writes already carry idempotency keys. Decide after the pilot shows how often and how long outages are.

### 1.5 Pre-launch checklist (S to M)

The checklist in `HANDOFF.md` stays the source: hosted Supabase project and settings, backups and a restore drill, code signing, kiosk policy, receipt printer test, error tracking.

## 5. Phase 2: control and visibility

### 2.1 Reason codes and comps (M)

- **Schema:** `reason_codes` (kind `void | discount | comp | waste | cash_movement`, name_en, name_ar, is_active). Voids, discounts and waste keep their free-text note and gain a code. New adjustment kind `comp` (own migration): a line given free, with a required reason code such as hospitality, staff meal or complaint.
- **Money maths:** `app.compute_tab_totals` and its TypeScript mirror in `packages/core/src/money/tabTotals.ts` both change, driven by new shared cases in `tab-totals-cases.json`.
- **Authorization:** manager PIN, like a discount.
- **Why:** comps recorded as discounts hide who is giving food away, and free-text reasons cannot be counted.

### 2.2 Audit log screen (S)

`/manage/audit`, manager and above (row-level security already restricts it). Filters: date, staff member, action. Each row shows who did it, who authorized it, the reason and the before and after values. Read-only.

### 2.3 Sold out (S)

- `menu_items.sold_out_at`, set and cleared by `app.set_item_sold_out(item_id, sold_out)` (cashier and above), cleared automatically by `open_day`.
- `add_items` raises `ITEM_SOLD_OUT`. Tiles on the tab screen show the state and are not tappable.
- The stock screen suggests items to mark when an ingredient in their recipe is at or below zero.

### 2.4 Bill printed state (S)

`tabs.bill_printed_at`, set when the cashier prints the bill. The floor shows "Bill printed" as a third table state, and analytics can flag voids made after the bill was printed.

### 2.5 Analytics by business day (M)

Analytics date events by calendar day (migration 0124); the day close uses the business day. A venue open past midnight sees two different totals for the same night. Move every analytics function to the business day of the tab's `day_session`, keep the hourly view by clock hour, and record the change as the first ADR in `docs/adr/`. The "calendar date" note on the panel goes away.

### 2.6 Analytics v2 on data already stored (L)

New functions in the analytics band, each with database tests against seeded scenarios.

| Function | Returns | Decision it supports |
|---|---|---|
| `analytics_headline_v2` | Net sales, covers, spend per cover, food cost %, each against the same weekdays in the previous period | Is today good or bad for this weekday? |
| `analytics_attention` | Open issues: cash variance over the alert level, low stock, staff outliers, ingredient price jumps, items with no recipe cost, failed kitchen tickets, a day left open | What needs the owner now? |
| `analytics_menu_engineering` | Per item: quantity, revenue, cost, contribution margin, share of category sales, class | Promote, reprice, reposition or remove |
| `analytics_stock_variance` | Between two finalized counts, per ingredient: opening + deliveries − closing = actual use; sales by recipe = theoretical use; recorded waste; unexplained difference in IQD | Where stock disappears |
| `analytics_staff_exceptions` | Per staff member: voids, discounts, comps and refunds as count, value and share of their own sales; who authorized; drawer opens without a sale | Who to talk to |
| `analytics_cash_variance` | Variance per cashier per shift over time | Repeated shortages |
| `analytics_weekday_hour` | Net sales and covers by weekday and hour | Staffing and opening hours |
| `analytics_price_changes` | Ingredients whose delivery cost rose, and the menu items whose margin it cuts | Reprice or change supplier |
| `analytics_by_waiter_v2` | Spend per cover and items per cover added to the current figures | Training |
| `analytics_table_turns` | Average tab duration and turns per table, by area | Seating and pacing |
| `analytics_category_mix`, `analytics_dead_items`, `analytics_by_order_type` | Sales by category; items unsold for 30 days; dine-in against takeaway | Menu size and focus |

Rules:

- **Menu engineering classes.** High margin means contribution margin at or above the category's weighted average. Popular means the item's share of category units is at least 70% of an even share (0.7 ÷ number of items). The 70% rule is the classic Kasavana and Smith threshold as I remember it; the search confirmed the average-based axes but not that number, so check it against a hospitality text before shipping. Items without a recipe cost are listed apart as "needs a recipe".
- **Outliers.** A staff member is flagged when their rate is above the venue mean plus one standard deviation over the trailing 12 weeks (the method in Oracle's exception reports), with a minimum sample so one void on a quiet day does not flag anyone. A flag is a prompt to open the transactions, not proof.
- **Comparisons.** A single day compares with the average of the last four same weekdays. A range compares with the previous range aligned by weekday.

Removed or demoted: the payment mix chart becomes one line of text; the best-seller chart folds into menu engineering.

Not built: revenue per seat-hour, customer lifetime value and retention, forecasting, live ticking counters, staff leaderboards.

## 6. Phase 3: profit

| # | Item | Size | Outline |
|---|---|---|---|
| 3.1 | Expenses | M | `expense_categories` and `expenses` (business date, category, amount, paid from till, bank or owner, supplier, note, optional link to a cash movement). A paid-out from the drawer can be filed as an expense in one step. |
| 3.2 | Time clock | M | `time_entries` (staff, clock in, clock out, edited by). Staff clock in with their PIN on any device. `staff.pay_type` (monthly, daily or hourly) and `staff.pay_amount`, owner-only columns. |
| 3.3 | Profit report | M | Net sales − cost of goods − labor − expenses, per business day and month. Adds labor cost %, prime cost (cost of goods plus labor) and sales per labor hour to the headline. |
| 3.4 | Supplier balances | M | Deliveries on credit and payments to suppliers, giving an amount owed per supplier. Purchase orders stay out until a venue asks. |

## 7. Phase 4: design pass

Direction, tokens and per-screen notes are in `docs/DESIGN-RESEARCH.md`. The pass touches only CSS, kit markup and screen markup (`DESIGN.md` section 1), so it can run beside phases 1 and 2. To avoid conflicts, 4.1 lands first and features built after it use the new kit.

| # | Item | Size | Scope |
|---|---|---|---|
| 4.1 | Foundations | M | Tokens in OKLCH, bundled Latin and Arabic font, type scale, state colours, the role-based shell (rail on wide screens, bottom bar on phones), kit states (hover, focus, active, disabled, busy), skeleton loading, the offline banner. |
| 4.2 | Tab screen | M | Three zones, basket and Send always in view, one-tap add, sold-out and locked states, portrait rule. |
| 4.3 | Floor | S | Status by fill, label and icon; elapsed time; own tables emphasised; takeaway list. |
| 4.4 | Till and shift | L | The largest design job: three panes, payment always visible, large due and change figures, split as a mode. |
| 4.5 | Analytics | L | "Needs attention" first, a figures strip, then sections. Chart palette and right-to-left chart rules. Phone layout for the owner. |
| 4.6 | Stock and admin | M | Tables, forms, the blind count (which must never show expected quantities). |
| 4.7 | Arabic pass and hardening | M | Line height, wrapping, mixed-direction text, long names, every state in both languages, performance on the real waiter tablet. |
| 4.8 | Kitchen ticket and receipt | S | Print design, separate from the app tokens. |

Each screen goes through shape (brief), build, critique and audit, then polish. Regenerate `docs/screenshots` in EN and AR at the end of each item.

## 8. Phase 5: later

| # | Item | Trigger to start |
|---|---|---|
| 5.1 | Offline queue for sends | Pilot shows outages long enough that paper is not acceptable |
| 5.2 | Kitchen display | A venue wants screens instead of printers; the ticket queue is ready |
| 5.3 | US dollar cash tender with an exchange rate | Pilot confirms dollar cash is common; if so, move this into phase 1 |
| 5.4 | Card terminal integration | A local acquirer offers an integration |
| 5.5 | Reservations and waitlist | A venue takes bookings |
| 5.6 | Daily summary sent to the owner by message | After 2.6 |
| 5.7 | Multi-branch UI | Second venue under one owner |
| 5.8 | Restock on refund, payments linked to lines | Already listed in `HANDOFF.md` |

## 9. Pilot questions

1. Do guests pay in US dollars in cash? How often, and how is the rate set?
2. How many kitchen and bar stations need a ticket, and which printers exist?
3. Does the kitchen read Arabic, English or both?
4. Does service run past midnight?
5. What share of orders is takeaway or delivery? Who takes them?
6. How are staff paid: monthly, daily or hourly?
7. Are suppliers paid in cash from the till, and do any deliver on credit?
8. How often does the internet or power drop during service, and for how long?
9. Which tablets will waiters use (model, screen size)? What is the till screen resolution?
10. Where does the owner look at numbers: at the till, on a laptop, or on a phone at home?

## 10. Suggested order

1. Phase 0, with the pilot questionnaire sent first.
2. 4.1 foundations and 1.1 cash movements in parallel.
3. 1.2 kitchen tickets, then 1.3 takeaway, then 1.4 outage handling. 4.2 to 4.4 run beside them.
4. 1.5 checklist, then the first venue goes live.
5. Phase 2 in this order: 2.5, 2.1, 2.4, 2.2, 2.3, then 2.6 with 4.5.
6. Phase 3, then phase 5 items as their triggers fire.

## 11. Sources

Operator needs and analytics:

- Restaurant365: [KPIs to track weekly](https://www.restaurant365.com/blog/5-restaurant-kpis-to-track-weekly/), [reducing comps and voids](https://www.restaurant365.com/blog/how-to-reduce-restaurant-comps-and-voids/)
- Toast: [restaurant benchmarks](https://pos.toasttab.com/blog/on-the-line/7-critical-restaurant-benchmarks), [menu engineering matrix](https://pos.toasttab.com/blog/on-the-line/menu-engineering-matrix), [configuring kitchen tickets](https://doc.toasttab.com/doc/platformguide/platformKitchenConfiguringTickets.html)
- ChowNow: [industry benchmarks](https://get.chownow.com/blog/restaurant-industry-benchmarks/)
- Mirus: [voids and comps](https://blog.mirus.com/restaurant-employee-theft-voids-comps)
- Oracle: [employee threshold exceptions](https://docs.oracle.com/en/industries/food-beverage/reporting-and-analytics/rarrg/c_emp_threshold_exceptions.htm)
- Lightspeed: [restaurant fraud and theft](https://lightspeedhq.com/blog/restaurant-fraud-theft)
- Mews: [kitchen order tickets](https://www.mews.com/en/blog/kitchen-order-ticket)
- Arab News: [Foodics Black for full-service restaurants](https://www.arabnews.com/news/foodics-black-an-all-in-one-platform-for-dine-in-full-service-restaurants-2656508)

Most of these are vendor publications. Benchmarks are starting points, not thresholds to enforce.
