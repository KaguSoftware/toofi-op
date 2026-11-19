# Handoff

Current state of the Restaurant Operator (working name) as of 2026-11-20. Read this first, then `CLAUDE.md` (rules), `docs/SPEC.md` (behaviour and schema contract), `GLOSSARY.md` (domain words) and `DESIGN.md` (UI restyle guide).

## Status

**v1 is functionally complete and verified on the local stack.**
- Waiters: floor plan, open a tab, order with modifiers, send, transfer and merge tabs, void with a manager PIN.
- Cashier: bill, discounts, cash and card, part and split payments, change, receipts, refunds, till shifts with blind count.
- Management: analytics panel, business day open and close, menu, floor, staff and venue admin.
- Stock: deduction by recipe, deliveries, waste, blind counts, low stock, margins.

The UI is plain on purpose; restyling is the design team's next step (see `DESIGN.md`).

**Last full verification** (fresh `db reset`, all green):

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | 5/5 packages pass |
| Database tests (`@rop/db`, against live Postgres) | 669 passed |
| Operator / core / i18n / shell unit tests | 178 / 184 / 54 / 78 passed |
| End-to-end, Playwright, EN and AR (`pnpm e2e`) | 19 passed |
| `pnpm security` (Electron hardening, error-code and RPC-registry checks) | pass |
| Windows unpacked desktop build (`dist:dir`), launched | starts cleanly |

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

**On site:**
- [ ] Test the real receipt printer (ESC/POS over network, port 9100) and the till PCs.
- [ ] Kiosk policy on the till PCs.
- [ ] Error tracking (renderer, main process, edge function) and uptime alerts.
- [ ] A written procedure for internet outages, since there is no offline mode.

## Known gaps and next steps

- **Design pass:** `DESIGN.md` lists the tokens, components, states and open questions. The `rop-till-*` and `rop-shift-*` classes have no styles yet. CSS files aren't covered by the RTL lint (only TSX inline styles are).
- **Arabic end-to-end coverage** skips stock counts and staff admin; the English specs cover them.
- **No end-to-end test** runs inside the packaged Electron app (it was smoke-launched only). Receipt-window hardening is unit-tested but not exercised on real hardware.
- **Possible v2:**
  - Offline queue.
  - Kitchen printing or a KDS.
  - Card terminal integration.
  - Multi-branch UI (the schema is ready).
  - Restock on refund.
  - Linking payments to lines for split-by-item.
