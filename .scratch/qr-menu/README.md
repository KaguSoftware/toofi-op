# QR menu: start here

A guest scans a table's QR code, reads the menu, calls a waiter or sends an order. Staff confirm with one tap. This folder is everything needed to build the rest of it in a fresh session.

## Read in this order

1. `/CLAUDE.md` (project rules; the guest exception to rule 1 is already in it).
2. `spec.md` in this folder: what it does, the owner's decisions, and the database contract. Its "As built" section is what the database really does.
3. `design.md` in this folder: the design the owner picked, with every measurement, colour and state.
4. `design/guest-menu-mock.dc.html`: the source of the approved mock. It holds the two ornament drawings (SVG paths), the icons, the Arabic and English copy, and the exact layout values. It is a reference, not production code.
5. The ticket you are working on, in `issues/`.

## Where things stand

| Step | Ticket | State |
|---|---|---|
| Database: QR links, sessions, calls, guest orders, switches | (done) | Built and tested, **not committed**. Migrations `0140` to `0144`, tests `packages/db/tests/guest-*.test.ts`. |
| Docs: rule 1 exception, glossary, SPEC | (done) | Committed in `cf0b3ee`. |
| Commit the database step | `issues/01-commit-database-step.md` | To do |
| Dish photos and category icons in the database | `issues/02-photos-and-icons-db.md` | To do |
| Shared tokens and guest site foundation | `issues/03-guest-site-foundation.md` | To do |
| Guest UI: menu and call waiter | `issues/04-guest-menu-and-call.md` | To do |
| Guest UI: basket, order, status | `issues/05-guest-basket-and-order.md` | To do |
| Staff app: alerts, sound, OK and Decline | `issues/06-staff-inbox.md` | To do |
| Staff app: QR cards, switches, photo upload, icon picker | `issues/07-staff-setup-screens.md` | To do |
| End-to-end tests, docs, CI, hosting notes | `issues/08-e2e-docs-hosting.md` | To do |

Work the tickets in number order, or in parallel as below.

## Running tickets in parallel

Ticket 01 goes first, alone, on `main`. After that:

| Wave | Tickets that can run at the same time | Each needs merged first |
|---|---|---|
| 1 | 02, 03, 06 | 01 |
| 2 | 04, 07 | 03 for 04; 02 for 07 |
| 3 | 05 | 04 |
| 4 | 08 | everything |

Rules for a session that runs beside others:

- **Own worktree, own branch.** Create a git worktree outside this folder (for example `../toofi-op-wt/02`) on a branch named `qr/<ticket>` (for example `qr/02-photos-and-icons-db`), and do all work there. Run `pnpm install` in it and copy the untracked env files it needs (`apps/operator/.env.local`). Never commit to `main` and never merge; report when the ticket is done and the owner merges.
- **One local database, shared by every worktree.** In wave 1 only the ticket 02 session may run `pnpm db:reset`, `pnpm db:types` or the `@rop/db` suite. Everyone else may read from the stack but must not reset it. In later waves, ask the owner before any reset.
- **Ticket 03 beside 02.** Build against the `guest_menu()` shape that ticket 02 defines (`icon` on categories, `photo_path` on items). Finish its "done when" checks after 02 is merged.
- **Shared files.** `packages/i18n` catalogs, `errors.ts`, `CLAUDE.md`, `lib/queryKeys.ts` and `rls-matrix.ts` are edited by several tickets. Add your lines in your own block; never reorder or reformat what is there.
- **Ports.** The staff app's dev server is fixed to 5174 and the end-to-end suite uses it too. If a port is taken, another session has it: wait, or ask the owner.
- **Merging.** Branches merge into `main` in ticket order. A ticket in a later wave starts from `main` after the tickets it needs are merged.

## Rules for the session that builds this

- The owner authors every commit alone. No AI trailers, no "Generated with" lines, in commits or PRs.
- `apps/operator/src/styles/base.css` has an uncommitted change that is not part of this work. Leave it out of your commits until ticket 03, and ask the owner about it before you touch that file.
- Money, stock and authorization logic is written test-first.
- Database tests need the local Supabase stack (API on 55421). They skip themselves when it is down: a skip is not a pass. Never run the database suite while another agent is using the stack.
- `../TouchPadel` is a reference only. Copy code from it and adapt it; never import from it, and bring no padel concepts in.
- Every user-visible string goes through `@rop/i18n`, in English and Arabic. CSS uses logical properties only.
- If the build has to differ from `spec.md` or `design.md`, change that file in the same piece of work.

## Checks before calling any ticket done

```
pnpm typecheck && pnpm lint
pnpm --filter @rop/core --filter @rop/i18n --filter @rop/operator --filter @rop/operator-shell test
pnpm --filter @rop/db test                # when the ticket touches the database; report skips as skips
pnpm --filter @rop/db check:error-codes
pnpm --filter @rop/db check:rpc-registry
```

Add the guest site's own `typecheck`, `lint` and `test` once ticket 03 creates it.
