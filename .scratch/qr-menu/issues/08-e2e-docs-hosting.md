# 08: End-to-end tests, docs, CI and hosting notes

Status: ready-for-agent
Blocked by: 05, 06, 07

Prove the whole path works, write down what changed, and list what the owner must do to go live.

## End-to-end (Playwright, `e2e/`)

Run the guest site and the staff app against the local stack. In English and in Arabic:

1. Owner prints codes; the test takes a token from `app.table_qr_tokens()`.
2. Guest opens `/t/<token>`, sees the menu and the table label.
3. Guest calls a waiter; a waiter's session shows the alert and taps OK; the guest sees "on the way".
4. Guest sends an order; a waiter taps OK and picks the guest count; the tab shows the lines; the cashier's bill matches; stock moved once.
5. Guest sends a second order; staff decline it; the guest is told to ask a waiter.
6. Owner replaces the code; the old address no longer opens a session.

Add guest screenshots (light, dark, Arabic) to `docs/screenshots`.

## Docs

- `DESIGN.md`: a guest site section (tokens package, dark set, the two ornaments, the screen and its states), and the staff inbox.
- `PRODUCT.md`: add the **Guest** as a user; reword the "food photography as decoration" anti-reference so one real photo per dish is allowed and decorative food imagery is still out.
- `docs/SPEC.md`, `GLOSSARY.md`, `README.md`, `HANDOFF.md`: the guest site, the commands, the new env values.
- `docs/PLAN.md`: note what this delivered and that kitchen tickets are still separate.

## CI

Build, typecheck, lint and test `@rop/menu`; run the new end-to-end spec with both apps.

## Hosting notes for the owner (write them into `HANDOFF.md`, do not do them)

- The hosted Supabase project must exist first (already on the pre-launch list): migrations applied, storage on, the `menu-photos` bucket present.
- Host the guest site (Vercel is what `../TouchPadel` uses) with the server-only Supabase URL and anon key.
- Put per-IP rate limiting in front of the site. The database limits per table; it cannot see a guest's IP.
- **Choose the final domain before printing any card.** The address is inside every code.
- Set `VITE_MENU_URL` in the staff app's release build to that domain.

## Done when

The end-to-end spec passes in both languages, every check in this folder's `README.md` passes, and the docs match the code.
