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

Work the tickets in number order. 04 and 05 can run after 03; 06 and 07 only need 01 and 02, so they can run beside 03 to 05 if a second agent is available, as long as only one agent uses the local database at a time.

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
