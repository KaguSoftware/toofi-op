# Handoff

Current state of the Restaurant Operator (working name) as of 2026-11-26. Read this first, then `CLAUDE.md` (rules), `docs/SPEC.md` (behaviour and schema contract), `GLOSSARY.md` (domain words) and `DESIGN.md` (UI restyle guide).

## Status

**v1 is functionally complete and verified on the local stack.**
- Waiters: floor plan, open a tab, order with modifiers, send, transfer and merge tabs, void with a manager PIN.
- Cashier: bill, discounts, cash and card, part and split payments, change, receipts, refunds, till shifts with blind count.
- Management: analytics panel, business day open and close, menu, floor, staff and venue admin.
- Stock: deduction by recipe, deliveries, waste, blind counts, low stock, margins.
- Guests: the QR menu site (`apps/menu`). A guest scans the table's code, reads the menu, calls a waiter or sends an order. Staff see every call and order on every screen and tap OK or Decline; an accepted order opens the tab and adds the lines as the staff member. Managers print the table cards and switch calls or ordering off; the owner replaces a table's code; managers add a photo to every dish and an icon to every category.

The UI is plain on purpose; restyling is the design team's next step (see `DESIGN.md`).

**Last full verification** (fresh `db reset`, all green):

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | 6/6 packages pass |
| Database tests (`@rop/db`, against live Postgres, none skipped) | 887 passed |
| Operator / core / i18n / shell / guest site unit tests | 324 / 194 / 54 / 79 / 336 passed |
| End-to-end, Playwright, EN and AR (`pnpm e2e`, includes the guest QR flow) | 35 passed |
| Error-code and RPC-registry checks (`check:error-codes`, `check:rpc-registry`) | pass |
| Electron hardening check (`check:electron`) and the Windows unpacked desktop build (`dist:dir`) | not re-run for the QR menu work (the desktop shell did not change); last run on 2026-11-20: pass, starts cleanly |

## Run it locally

Prerequisites: Node 22, pnpm 9, Docker (about 2 GB free).

```bash
pnpm install
pnpm db:start && pnpm db:reset          # local Supabase on 55421 (API) / 55422 (DB); seeds demo data
cp apps/operator/.env.example apps/operator/.env.local   # local URL + demo anon key
pnpm --filter @rop/operator dev
```

Demo logins are in the header of `packages/db/supabase/seed.sql`. For example, `owner@demo.local` / `demo-pass-123`, and each role has its own PIN. **The seed is for local development only and must never be applied to a hosted project.**

**Gotchas:**
- Root `pnpm test` also runs the database suite against whatever is on port 55421. Don't run it while someone else is using that database.
- If `ELECTRON_RUN_AS_NODE=1` is set in your shell, the desktop exe exits silently. Unset it first.
- Starting several Supabase stacks at once can run Docker out of memory and hang it.
- The guest site needs its own env: `cp apps/menu/.env.example apps/menu/.env.local` and paste the local anon key (`SUPABASE_URL` and `SUPABASE_ANON_KEY`, server-only). Run it with `pnpm --filter @rop/menu dev` (port 5180). To print table cards from the staff app in development, set `VITE_MENU_URL=http://localhost:5180` in `apps/operator/.env.local`.
- `pnpm e2e` starts both dev servers (5174 and 5180) and resets the database for every spec. If either port is taken, another session has it.

## What's where

| Area | Location |
|---|---|
| Schema, functions, access rules | `packages/db/supabase/migrations/` (39 files; bands: 0001–0011 schema, 0020s money, 0040s stock/analytics, 0060s catalog, 0080s review fixes, 0100+ late fixes) |
| Staff creation and password reset | `packages/db/supabase/functions/staff-admin/` |
| Money maths: SQL source of truth plus a TypeScript mirror | `app.compute_tab_totals` and `packages/core/src/money/tabTotals.ts`, kept in sync by the shared cases in `packages/core/src/money/__fixtures__/tab-totals-cases.json` |
| Screens | `apps/operator/src/features/<area>/` (UI in `*Screen.tsx`, pure logic plus tests in `*Logic.ts`) |
| Desktop shell | `apps/operator-shell/` (kiosk, ESC/POS printing, auto-update, CSP) |
| End-to-end tests | `e2e/tests/*.spec.ts`; each spec resets the database |
| Releases | `docs/RELEASING.md`, `.github/workflows/operator-release.yml` |
| Brand strings (rename here) | `brand.config.json` |

## Key decisions

- **The server owns every number.** Clients never send prices; every write goes through an `app.*` function; tables are read-only to clients.
- **Money is integer IQD.** Prices include tax. Percent discounts are recomputed from the live subtotal, so a void after a 10% discount keeps it at 10%.
- **Append-only ledgers.** Payments, refunds, stock movements and the audit log are never updated or deleted.
- **Idempotency keys on every write.** After a timeout the client locks the basket or payment and checks the server before allowing a retry with the same key.
- **Manager PIN grants** are bound to the action, the row and the value, and expire after 2 minutes. The lockout is serialised per user.
- **Refunds** go to the refunding device's shift and the business day that was open when they were given.
- **Stock** is deducted by recipe when items are sent. Voids return stock; refunds don't (v1). Counts adjust against the on-hand figure captured at the moment each line was counted.
- **Online-only v1.** There's no offline queue, but writes are idempotent so one can be added later.
- **Analytics** are by calendar date. The day-close summary is the official per-day total; the UI says so.

## Accepted risks (deliberate, documented)

- **The till blind count is blind only in the UI.** Cashiers can see the payments on bills, so a determined cashier could add up their own drawer. Mitigation: a variance alert on each shift (`venue_settings.variance_alert_iqd`, default 5,000 IQD), an audit row, and a Till shifts table on `/manage/day`.
- **The stock count is blind only in the UI for managers**, who can read on-hand stock elsewhere.
- **Kiosk exit and quit are trusted from the client.** Rely on Windows Assigned Access or a kiosk policy on till PCs.
- **`split_by_item`** can't tell which lines an earlier split already paid, because payments aren't linked to lines. The till remembers this per tab in the browser.

## Pre-launch checklist (needed before a real restaurant uses it)

**Backend / Supabase:**
- [ ] Create the hosted Supabase project. Apply the migrations (not `seed.sql`). Create the owner account through the `staff-admin` function or the dashboard.
- [ ] Hosted settings `config.toml` does not carry over:
  - [ ] Sign-ups off.
  - [ ] `app` schema exposed.
  - [ ] JWT expiry and refresh-token rotation.
  - [ ] Realtime set to private channels only.
  - [ ] Sign-in rate limits and a password policy.
- [ ] Turn on PITR and backups, then do a restore drill.
- [ ] Confirm `pg_cron` runs `rop-purge-housekeeping` (migration 0123 header) and that the `postgres` role can revoke sessions (`app.revoke_user_sessions`).

**Desktop app and releases:**
- [ ] Code-signing certificate, plus `WIN_SIGN_PUBLISHER_NAME`. Unsigned releases are refused by design.
- [ ] GitHub: a public releases repo, the `release` environment with required reviewers, a tag ruleset on `operator-v*`, secrets moved into the environment (see `docs/RELEASING.md`).
- [ ] Final product name, icon and app ID in `brand.config.json`.

**Guest QR menu (do these in order; none is done by the code):**
- [ ] The hosted Supabase project (first item above) must exist with the migrations applied, **storage on** and the `menu-photos` bucket present (migration `0151` creates it; check it in the dashboard).
- [ ] Host the guest site (`apps/menu`; Vercel is what `../TouchPadel` uses). Set the server-only `SUPABASE_URL` and the hosted **anon** key. Never the service-role key, and never a `NEXT_PUBLIC_` name.
- [ ] Put per-IP rate limiting in front of the site (the host's firewall or a CDN rule). The database limits sessions and orders per table; it cannot see a guest's IP.
- [ ] **Choose the final domain before printing any card.** The address is inside every printed code, and a wrong one is a dead card for months. If the domain ever changes, every card must be printed again.
- [ ] Set `VITE_MENU_URL` to that domain in the staff app's release build (the CI secret or variable used for the release, see `docs/RELEASING.md`). The app refuses to print cards in a production build without it, or with a local or private address.
- [ ] Once the site is live: print one card, scan it with a phone, call a waiter and send an order end to end, then print the rest.
- [ ] Give every dish a photo (Manage → Menu shows how many are missing) and check the Arabic guest text with a native reader.

**On site:**
- [ ] Test the real receipt printer (ESC/POS over network, port 9100) and the till PCs.
- [ ] Kiosk policy on the till PCs.
- [ ] Error tracking (renderer, main process, edge function) and uptime alerts.
- [ ] A written procedure for internet outages, since there is no offline mode.

## Known gaps and next steps

- **Design pass:** `DESIGN.md` lists the tokens, components, states and open questions. The `rop-till-*` and `rop-shift-*` classes have no styles yet. CSS files aren't covered by the RTL lint (only TSX inline styles are).
- **Arabic end-to-end coverage** skips stock counts and staff admin; the English specs cover them. The guest flow (`e2e/tests/guest-qr.spec.ts`) runs in both languages.
- **Guest QR menu, not built on purpose:** paying from the phone, showing the guest the bill, the guest cancelling an accepted order, dish descriptions, kitchen tickets (plan item 1.2 is separate). Modifier groups have no sort order, so they show in creation order.
- **No end-to-end test** runs inside the packaged Electron app (it was smoke-launched only). Receipt-window hardening is unit-tested but not exercised on real hardware.
- **Possible v2:**
  - Offline queue.
  - Kitchen printing or a KDS.
  - Card terminal integration.
  - Multi-branch UI (the schema is ready).
  - Restock on refund.
  - Linking payments to lines for split-by-item.
