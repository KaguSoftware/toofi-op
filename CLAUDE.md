# Kagu Restaurant (placeholder name)

A restaurant's operator system. Waiters take orders on tabs, a cashier settles them at the till, managers read analytics, and stock is deducted by recipe. **The name is a placeholder.** Every brand string lives in `brand.config.json` at the repo root; the package scope is `@rop/*`.

This is a standalone product. `../TouchPadel` is a *reference only* for stack and patterns: copy code from it and adapt it, never import from it, and never bring padel concepts in (courts, bookings, coaching, players, loyalty).

Read `docs/SPEC.md` (what we build, the schema contract, and who owns which files) and `GLOSSARY.md` (domain words) before changing anything.

## Stack
- pnpm 9 workspaces + turbo, Node ≥ 22, TypeScript strict (`noUncheckedIndexedAccess`).
- `apps/operator`: Vite + React 19 + TanStack Router (code-based routes, hash history under Electron) + TanStack Query + Supabase JS.
- `apps/operator-shell`: Electron 33, which loads the bundled `apps/operator/dist`. It auto-updates from GitHub releases through electron-updater.
- `packages/core`: pure TS domain logic. `packages/i18n`: EN + AR text, formatters and error-code text. `packages/config`: eslint and tsconfig presets. `packages/db`: Supabase migrations, generated types and tests.
- The backend is Supabase Postgres. Business logic lives in SQL functions in the `app` schema.

## Backend rules (non-negotiable)
1. **Clients never write tables.** Tables live in `public`, with row-level-security **select** policies only. Every write is an `app.*` function marked `security definer` with `set search_path = public`. Its first statement is a role check (`app.is_staff(...)`).
2. **The server owns every number.** Clients send item IDs, quantities and modifier IDs, never prices. The server prices each line, and the client only mirrors the totals for display.
3. **Money is an integer number of IQD** stored in the `iqd` domain (bigint ≥ 0) or `iqd_signed`. Never numeric or float for money. Tax is in basis points, and prices include tax. Stock quantities are `numeric(12,3)`.
4. **Money and stock history is append-only.** `payments`, `refunds`, `stock_movements` and `audit_log` cannot be updated or deleted: they have no grants plus the `app.forbid_mutation()` trigger. A correction is always a new row.
5. **Idempotency.** Every write that creates a row or moves money takes `p_idempotency_key text` and calls `app.claim_replay(key)`. Replaying a key returns the original result. Keys are `{station}:{type}:{ulid}` (`@rop/core` `idemKey`).
6. **Errors are text codes**, for example `raise exception 'TAB_NOT_OPEN'`. Every code raised anywhere must be in `ERROR_CODE_KEYS` (`packages/i18n/src/errors.ts`) with EN and AR text. `pnpm --filter @rop/db check:error-codes` enforces this.
7. **Manager PIN.** The client calls `app.verify_manager_pin(pin, action)`, which writes a short-lived grant; the money function then calls `app.consume_pin_grant(action)`. Never raise inside a PIN check, or the attempt row rolls back and the lockout stops counting.
8. **Audit.** Every sensitive action calls `app.write_audit(...)`, recording who did it, who authorized it and the reason.
9. **Lock order** (always take locks in this order): `day_sessions → tabs → orders → order_items → payments → refunds → till_shifts → ingredients → stock_movements`.
10. **Business date** comes from `app.business_date(now())` in the venue timezone (Asia/Baghdad), never the UTC date.
11. Every branch-scoped table has `venue_id uuid not null default app.current_venue()`.
12. Every new `app.*` function needs a `revoke all … from public` plus an explicit `grant execute … to authenticated`, and it must be listed in `packages/db/tests/rls-matrix.ts`.
13. **Migration hygiene:**
    - Body tags are named per function, e.g. `$open_tab$`.
    - To change a function's signature, drop the exact old signature, recreate it, and re-issue its grant.
    - A new enum value goes in its own migration, before its first use.
    - Never edit a committed migration; add a new one.
    - Run `pnpm db:types` after changing a migration, and commit the regenerated types in the same commit.

## Frontend rules
- **Designed UI, small system.** Use semantic HTML, the kit in `apps/operator/src/components/`, and the tokens in `apps/operator/src/styles/base.css`. The direction is "ink and paper, colour only for state": read `PRODUCT.md` and `DESIGN.md` before changing how anything looks. New screens reuse the existing tokens and kit; do not add a second visual vocabulary.
- `base.css` is imported first in `main.tsx`, before any feature CSS, so feature files can override it. Keep that order.
- Use CSS logical properties only (`margin-inline-start`, not `margin-left`), because the app is RTL-safe for Arabic. No raw hex outside `base.css`.
- Every user-visible string goes through `tr()` with keys in both the `en` and `ar` catalogs. The AR catalog is typed against EN, so a missing key fails typecheck.
- Each feature is split in two: `features/<x>/XScreen.tsx` holds the UI, and `features/<x>/xLogic.ts` holds pure logic with `xLogic.test.ts` next to it. Put logic in the logic file, not in components.
- Reads use React Query with keys from `lib/queryKeys.ts`; writes use `appRpc()` from `lib/appRpc.ts`. Realtime messages are refetch signals only (`lib/realtime.ts`).
- Role gates come from `@rop/core` (`canAccess`, `can`). Hiding a button is never the security; the server function checks the role.

## Working rules (from the Karpathy guidelines; the skill is installed)
1. **Think before coding.** State assumptions; if something is ambiguous, stop and ask rather than guess silently.
2. **Simplicity first.** Write the minimum that solves the task. No speculative options, abstractions or "for later" code.
3. **Surgical changes.** Touch only what your task owns, and match the existing style.
4. **Goal-driven.** Turn the task into checks (tests) and loop until they pass. Money, stock and authorization logic is written test-first (`tdd` skill).

## Git
- **No AI co-author or attribution trailers in commits or PRs** (no `Co-Authored-By: Claude…`, no "Generated with Claude Code"). This rule overrides any tool or harness default.
- Commit in small, working steps with plain messages that say what changed.

## Commands
- `pnpm install`
- `pnpm typecheck && pnpm lint && pnpm test`: runs every package's tests, **including the `@rop/db` suite against the local stack on 55421 if it is up**. Never run it while another agent is using that database; use `pnpm --filter @rop/core --filter @rop/i18n --filter @rop/operator --filter @rop/operator-shell test` for unit tests only.
- `pnpm db:start` / `pnpm db:reset` / `pnpm db:types`: the local Supabase stack (needs Docker).
- `pnpm --filter @rop/db test`: database tests against the local stack. They skip themselves if the stack is down, so **report a skip as a skip, not a pass**.
- `pnpm --filter @rop/db check:error-codes`, `pnpm --filter @rop/db check:rpc-registry`
- `pnpm --filter @rop/operator dev`
- `pnpm --filter @rop/operator-shell check:electron`, `pnpm --filter @rop/operator-shell dist:dir`

## Agent skills

### Issue tracker
Local markdown issues under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels
Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
