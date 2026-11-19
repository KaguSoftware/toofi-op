<div align="center">

# 🍽️ Restaurant Operator

*Working name. Every brand string lives in [`brand.config.json`](brand.config.json).*

**Tabs, till and stock for a restaurant floor: one system, English and Arabic.**

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A5%2022-339933?logo=nodedotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-1%2C182%20passing-brightgreen)
![Languages](https://img.shields.io/badge/languages-EN%20%7C%20AR%20(RTL)-blue)

[Features](#-features) · [Screenshots](#%EF%B8%8F-screenshots) · [Architecture](#%EF%B8%8F-architecture) · [Quick start](#-quick-start) · [Docs](#-docs)

</div>

---

## 📖 What it is

Restaurant Operator is a point-of-sale and back-of-house system for a single venue. Waiters take orders on tabs from tablets, a cashier settles them at the till, managers read analytics, and stock is deducted automatically from recipes. It runs in English and Arabic (RTL), prices in Iraqi dinar (IQD) and keeps time in `Asia/Baghdad`.

The server owns every number. The client sends item IDs and quantities, and Postgres functions do the pricing, tax, stock and authorization.

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🧑‍🍳 Waiters
- Floor plan with table status
- Open a tab on a table, set covers
- Build a basket, then **send** it as an order
- Transfer and merge their own open tabs
- Void a sent line with a manager PIN

</td>
<td width="50%" valign="top">

### 💵 Cashier
- Bill any open tab, cash or card
- Part payments, split evenly or by item
- Change calculation and receipt printing
- Cash drawer control from the till
- Till shift with opening float and blind count

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📊 Management
- Open and close the business day
- Discounts, refunds and cancelling a tab
- Analytics panel
- Menu, floor plan and staff admin
- Owner-only venue settings and PINs

</td>
<td width="50%" valign="top">

### 📦 Stock
- Ingredients in g, ml or pc, with recipes
- Sales deduct stock automatically
- Deliveries, waste and blind counts
- Low-stock list
- Margins per menu item

</td>
</tr>
</table>

> **Not in v1:** offline mode, kitchen printing, kitchen display screens (KDS), card terminal integration, multi-branch UI. See [`docs/SPEC.md`](docs/SPEC.md).

## 🖼️ Screenshots

<!-- SCREENSHOTS:START -->
<table>
<tr><td align="center"><img src="docs/screenshots/en/floor.png" alt="Floor plan"><br><sub><b>Floor plan</b></sub></td><td align="center"><img src="docs/screenshots/en/tab-item-sheet.png" alt="Ordering with modifiers"><br><sub><b>Ordering with modifiers</b></sub></td><td align="center"><img src="docs/screenshots/en/till.png" alt="Till and payment"><br><sub><b>Till and payment</b></sub></td></tr>
<tr><td align="center"><img src="docs/screenshots/en/manage.png" alt="Management panel"><br><sub><b>Management panel</b></sub></td><td align="center"><img src="docs/screenshots/en/stock-on-hand.png" alt="Stock on hand"><br><sub><b>Stock on hand</b></sub></td><td align="center"><img src="docs/screenshots/en/till-shift.png" alt="Till shift"><br><sub><b>Till shift</b></sub></td></tr>
</table>

<p align="center"><b>Full Arabic, right-to-left</b></p>
<table>
<tr><td align="center"><img src="docs/screenshots/en/till.png" alt="English"><br><sub><b>English</b></sub></td><td align="center"><img src="docs/screenshots/ar/till.png" alt="العربية"><br><sub><b>العربية</b></sub></td></tr>
</table>

<details>
<summary><b>All 19 screens, English and Arabic</b></summary>

<table>
<tr><th>Screen</th><th>English</th><th>العربية</th></tr>
<tr><td><b>Sign in</b></td><td><img src="docs/screenshots/en/login.png" alt="Sign in (EN)" width="380"></td><td><img src="docs/screenshots/ar/login.png" alt="Sign in (AR)" width="380"></td></tr>
<tr><td><b>Floor plan</b></td><td><img src="docs/screenshots/en/floor.png" alt="Floor plan (EN)" width="380"></td><td><img src="docs/screenshots/ar/floor.png" alt="Floor plan (AR)" width="380"></td></tr>
<tr><td><b>Open tab</b></td><td><img src="docs/screenshots/en/tab.png" alt="Open tab (EN)" width="380"></td><td><img src="docs/screenshots/ar/tab.png" alt="Open tab (AR)" width="380"></td></tr>
<tr><td><b>Item and modifiers</b></td><td><img src="docs/screenshots/en/tab-item-sheet.png" alt="Item and modifiers (EN)" width="380"></td><td><img src="docs/screenshots/ar/tab-item-sheet.png" alt="Item and modifiers (AR)" width="380"></td></tr>
<tr><td><b>Till</b></td><td><img src="docs/screenshots/en/till.png" alt="Till (EN)" width="380"></td><td><img src="docs/screenshots/ar/till.png" alt="Till (AR)" width="380"></td></tr>
<tr><td><b>Settled tab and receipt</b></td><td><img src="docs/screenshots/en/till-settled.png" alt="Settled tab and receipt (EN)" width="380"></td><td><img src="docs/screenshots/ar/till-settled.png" alt="Settled tab and receipt (AR)" width="380"></td></tr>
<tr><td><b>Till shift</b></td><td><img src="docs/screenshots/en/till-shift.png" alt="Till shift (EN)" width="380"></td><td><img src="docs/screenshots/ar/till-shift.png" alt="Till shift (AR)" width="380"></td></tr>
<tr><td><b>Management panel</b></td><td><img src="docs/screenshots/en/manage.png" alt="Management panel (EN)" width="380"></td><td><img src="docs/screenshots/ar/manage.png" alt="Management panel (AR)" width="380"></td></tr>
<tr><td><b>Business day</b></td><td><img src="docs/screenshots/en/manage-day.png" alt="Business day (EN)" width="380"></td><td><img src="docs/screenshots/ar/manage-day.png" alt="Business day (AR)" width="380"></td></tr>
<tr><td><b>Menu admin</b></td><td><img src="docs/screenshots/en/manage-menu.png" alt="Menu admin (EN)" width="380"></td><td><img src="docs/screenshots/ar/manage-menu.png" alt="Menu admin (AR)" width="380"></td></tr>
<tr><td><b>Floor admin</b></td><td><img src="docs/screenshots/en/manage-floor.png" alt="Floor admin (EN)" width="380"></td><td><img src="docs/screenshots/ar/manage-floor.png" alt="Floor admin (AR)" width="380"></td></tr>
<tr><td><b>Staff and settings</b></td><td><img src="docs/screenshots/en/manage-staff.png" alt="Staff and settings (EN)" width="380"></td><td><img src="docs/screenshots/ar/manage-staff.png" alt="Staff and settings (AR)" width="380"></td></tr>
<tr><td><b>Stock on hand</b></td><td><img src="docs/screenshots/en/stock-on-hand.png" alt="Stock on hand (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-on-hand.png" alt="Stock on hand (AR)" width="380"></td></tr>
<tr><td><b>Receive delivery</b></td><td><img src="docs/screenshots/en/stock-receive.png" alt="Receive delivery (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-receive.png" alt="Receive delivery (AR)" width="380"></td></tr>
<tr><td><b>Waste</b></td><td><img src="docs/screenshots/en/stock-waste.png" alt="Waste (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-waste.png" alt="Waste (AR)" width="380"></td></tr>
<tr><td><b>Blind stock count</b></td><td><img src="docs/screenshots/en/stock-count.png" alt="Blind stock count (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-count.png" alt="Blind stock count (AR)" width="380"></td></tr>
<tr><td><b>Recipes</b></td><td><img src="docs/screenshots/en/stock-recipes.png" alt="Recipes (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-recipes.png" alt="Recipes (AR)" width="380"></td></tr>
<tr><td><b>Item margins</b></td><td><img src="docs/screenshots/en/stock-margins.png" alt="Item margins (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-margins.png" alt="Item margins (AR)" width="380"></td></tr>
<tr><td><b>Ingredients and suppliers</b></td><td><img src="docs/screenshots/en/stock-admin.png" alt="Ingredients and suppliers (EN)" width="380"></td><td><img src="docs/screenshots/ar/stock-admin.png" alt="Ingredients and suppliers (AR)" width="380"></td></tr>
</table>
</details>
<!-- SCREENSHOTS:END -->

> The UI is **deliberately unstyled** while the design pass is pending. Structure and class names are kept clean so it can be restyled without touching logic.

## 🔄 How a service works

```mermaid
sequenceDiagram
    autonumber
    actor W as Waiter
    actor C as Cashier
    actor M as Manager
    participant S as Server
    participant L as Stock ledger

    W->>S: Open tab on a table
    W->>S: Send basket (item IDs and quantities)
    S->>S: Price every line and apply tax
    S->>L: Append sale movements from recipes
    C->>S: Settle tab (cash or card, split if needed)
    S-->>C: Change due and receipt
    M->>S: Read analytics for the business day
```

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Clients
        T["Electron till shell<br/>kiosk, ESC/POS printer, auto-update"]
        B["Browser waiter tablets"]
        APP["React operator app<br/>Vite, TanStack Router and Query"]
        T --> APP
        B --> APP
    end
    subgraph Supabase
        FN["app.* functions<br/>security definer"]
        PG[("Postgres<br/>RLS select-only tables")]
        RT["Realtime"]
        EF["staff-admin edge function"]
        FN --> PG
        PG --> RT
        EF --> PG
    end
    APP -- "writes via RPC" --> FN
    APP -- "reads under RLS" --> PG
    RT -. "refetch signals" .-> APP
    APP -- "staff management" --> EF
```

### Guarantees

- **The server prices everything.** Clients never send prices; they only mirror totals for display.
- **Integer IQD.** Money is a bigint in the `iqd` domain. Tax is in basis points and prices include tax.
- **Append-only ledgers.** Payments, refunds, stock movements and the audit log cannot be updated or deleted. A correction is a new row.
- **Idempotent writes.** Every money or row-creating call carries a key, and a replay returns the original result.
- **Manager-PIN grants.** Sensitive actions need a short-lived grant that the server consumes.
- **Audit log.** Every sensitive action records who did it, who authorized it and why.
- **RLS read-only tables.** Clients can only `select`. Every write is an `app.*` function that checks the role first.

## 🔐 Roles

| Capability | Waiter | Cashier | Manager | Owner |
|---|:---:|:---:|:---:|:---:|
| See floor, open tabs, add items, transfer and merge own tabs | ✅ | ✅ | ✅ | ✅ |
| Void a sent line | 🔑 PIN | 🔑 PIN | ✅ | ✅ |
| Take payments, settle, split, drawer, own till shift | — | ✅ | ✅ | ✅ |
| Discount, refund, cancel a non-empty tab, close another's shift | — | 🔑 PIN | ✅ | ✅ |
| Open and close the day, analytics, stock | — | — | ✅ | ✅ |
| Menu, floor and stock item admin | — | — | ✅ | ✅ |
| Staff admin, venue settings, set PINs | — | — | — | ✅ |

> 🔑 PIN means a manager or owner PIN is required. The UI only hides buttons; the server checks the role on every call.

## 🚀 Quick start

**Prerequisites:** Node 22, pnpm 9, Docker (for the local Supabase stack).

1. Install dependencies.
   ```bash
   pnpm install
   ```
2. Start the local Supabase stack (API on port 55421).
   ```bash
   pnpm db:start
   ```
3. Apply migrations and seed demo data.
   ```bash
   pnpm db:reset
   ```
4. Create `apps/operator/.env.local` from the example.
   ```bash
   cp apps/operator/.env.example apps/operator/.env.local
   ```
5. Run the operator app.
   ```bash
   pnpm --filter @rop/operator dev
   ```

### Demo logins

> **Local development only.** Created by `packages/db/supabase/seed.sql`. Never use these anywhere real.

| Role | Email | Password | PIN |
|---|---|---|---|
| Owner | `owner@demo.local` | `demo-pass-123` | `482916` |
| Manager | `manager@demo.local` | `demo-pass-123` | `735194` |
| Cashier | `cashier@demo.local` | `demo-pass-123` | `264853` |
| Waiter | `waiter@demo.local` | `demo-pass-123` | `917352` |

## 🗂️ Project layout

```text
.
├── apps/
│   ├── operator/          Vite + React 19 app: features/, components/, lib/, shell/
│   └── operator-shell/    Electron 33 shell: kiosk window, ESC/POS printing, auto-update
├── packages/
│   ├── core/              Pure TypeScript domain logic: roles, money, idempotency keys
│   ├── i18n/              EN and AR catalogs, formatters, error-code text
│   ├── db/                Supabase migrations, seed, edge functions, generated types, DB tests
│   └── config/            Shared eslint and tsconfig presets
├── docs/                  SPEC, RELEASING, ADRs, agent notes
├── brand.config.json      Single source of brand strings
└── GLOSSARY.md            Domain vocabulary
```

## 🧰 Commands

| Task | Command |
|---|---|
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit tests (no database) | `pnpm --filter @rop/core --filter @rop/i18n --filter @rop/operator --filter @rop/operator-shell test` |
| Database tests | `pnpm --filter @rop/db test` |
| Security and consistency checks | `pnpm security` |
| Error-code and RPC registry checks | `pnpm --filter @rop/db check:error-codes` and `pnpm --filter @rop/db check:rpc-registry` |
| Regenerate DB types | `pnpm db:types` |
| End-to-end browser tests | `pnpm e2e` |
| Desktop build (unpacked, unsigned) | `pnpm --filter @rop/operator-shell dist:dir` |

> ⚠️ Root `pnpm test` runs **every** package's tests, including the `@rop/db` suite against the local stack on port 55421 if it is up. Do not run it while someone else is using that database. DB tests skip themselves when the stack is down, and a skip is not a pass.

End-to-end: `pnpm e2e:install` once, then `pnpm e2e` (Playwright, EN + AR projects, needs the local stack; each spec resets the database). It also regenerates the screenshots above.

## 🖥️ Desktop app and releases

The till runs the operator app inside an Electron 33 shell that loads the bundled build, prints ESC/POS receipts and updates itself from GitHub releases. Pushing a tag `operator-v<semver>` on a green `main` commit builds a signed installer behind a protected `release` environment, and unsigned releases are refused. Full runbook: [`docs/RELEASING.md`](docs/RELEASING.md).

## 📚 Docs

| Document | What it covers |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Scope, roles, core flows, schema contract |
| [`GLOSSARY.md`](GLOSSARY.md) | Domain words: tab, send, settle, till shift and more |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Signing, secrets and cutting a release |
| [`CLAUDE.md`](CLAUDE.md) | Agent and developer rules: backend, frontend, git |
| [`DESIGN.md`](DESIGN.md) | UI restyle guide for the design team: tokens, components, screens, constraints |
| [`HANDOFF.md`](HANDOFF.md) | Current state, decisions, accepted risks and the pre-launch checklist |

## 🤝 Contributing

- **Logic in logic files.** Each feature is `XScreen.tsx` for UI plus `xLogic.ts` with `xLogic.test.ts`. Money, stock and authorization code is written test-first.
- **EN and AR together.** Every visible string goes through `tr()` with keys in both catalogs; a missing Arabic key fails typecheck.
- **Logical CSS properties only** (`margin-inline-start`, never `margin-left`), so RTL just works.
- **Migrations are never edited.** Add a new one, then run `pnpm db:types` and commit the regenerated types with it.
- **No AI co-author trailers** in commits or PRs. Use small commits with plain messages.

---

<div align="center">

Built by **Kagu Software**

</div>
