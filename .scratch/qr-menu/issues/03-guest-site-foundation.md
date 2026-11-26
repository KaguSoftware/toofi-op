# 03: Shared tokens and the guest site foundation

Status: ready-for-agent
Blocked by: 01, 02

Create the guest site and everything under its UI: tokens, the table session, the server routes, the data plumbing. No finished screens yet (tickets 04 and 05).

## Shared tokens

- New package `packages/tokens` (`@rop/tokens`): the `--rop-*` custom properties, the font faces and the ornament assets, moved out of `apps/operator/src/styles/base.css`. `base.css` imports the package first and keeps everything that is not a token.
- The staff app must look identical. Prove it with the existing screenshot spec (`e2e/tests/screenshots.spec.ts`) before and after.
- `base.css` has an uncommitted change that is not ours. Ask the owner to commit or drop it before you move anything.
- Add the guest-only pieces: a dark token set under `prefers-color-scheme: dark`, the dish row card fill, the row ornament green (`design.md`, "Tokens"). The staff app stays `color-scheme: light`.

## The site: `apps/menu` (`@rop/menu`)

Next.js App Router, TypeScript strict, the same Next and React versions as `../TouchPadel/apps/web`. Adapt from that app; do not import from it. Useful sources there: `proxy.ts`, `src/lib/security/headers.ts`, `src/lib/cafe/tableSession.ts`, `src/hooks/cafe/useTableSession.ts`, `src/lib/menu.server.ts`, `src/lib/appRpc.ts`.

**The browser never talks to Supabase.** Only the site's server does, with the anon key, calling the five guest functions in schema `app`. Keep the URL and key in server-only env names (no `NEXT_PUBLIC_`). No Supabase anonymous sign-in: our session is the id `open_table_session` returns.

| Route | Behaviour |
|---|---|
| `GET /t/[token]` | The address printed in the QR code. Refuse anything that is not 22 base64url characters. Call `open_table_session`. On success set the cookie `rop-table` = the session id (HttpOnly, Secure outside dev, SameSite=Lax, path `/`, 2 hours) and answer 307 to `/`. On `TABLE_LINK_INVALID` go to `/` with a "scan again" notice and no cookie. Response is `no-store` with `Referrer-Policy: no-referrer`. The token is never rendered or logged. |
| `GET /` | The menu. Server-rendered from `guest_menu()` (cached about 60 s, one tag so it can be revalidated). If the cookie holds a session, read `guest_status` for the table label and switches; on `SESSION_EXPIRED` clear the cookie. Works with no cookie as a browse-only menu. |
| `POST /api/call` | `{reason, key}` → `raise_waiter_call`. |
| `POST /api/order` | `{items, key}` → `send_guest_order`. Items carry ids, quantities, modifier ids and a note; never a price. |
| `GET /api/status` | → `guest_status`. |
| `POST /api/locale` | Sets the `rop-locale` cookie. |

- Every `/api/*` call must carry the header `x-rop-guest: 1` and is refused without it (a cross-site form cannot add it). Every answer is `no-store`.
- Map database error codes to results the UI can act on (`expired`, `closed`, `off`, `too-soon`, `limit`, `stale-menu`, `error`), in one module with tests. Give guests their own wording for the codes listed under "Reused codes with staff wording" in `spec.md`.
- Language: the `rop-locale` cookie, then `Accept-Language`, then Arabic. Set `lang` and `dir` on `<html>`. No locale in the path.
- Security headers on every response: a per-request nonce CSP with no `unsafe-inline` for scripts, HSTS, `X-Frame-Options: DENY`, `nosniff`, a locked-down Permissions-Policy. Allow images from the Supabase storage origin only. No analytics, no third-party scripts, no font CDN.
- Photo URLs: `{SUPABASE_URL}/storage/v1/object/public/menu-photos/{photo_path}`, built on the server.
- Idempotency keys are made in the browser, one per user action, and reused for that action's retries (`idemKey` from `@rop/core`, with a per-device station id kept in `localStorage`).

## Also

- Guest strings go in `@rop/i18n` under `guest.*`, both catalogs.
- Follow the repo's split: UI in components, pure logic in `*Logic.ts` with a test beside it.
- Add the app to turbo, lint, typecheck, test and CI. Add it to `CLAUDE.md` (Stack, Commands) and `README.md`.

## Done when

- `pnpm --filter @rop/menu dev` serves the menu from the local stack; a token from `app.table_qr_tokens()` opened as `/t/<token>` lands on `/` with the cookie set and no token in the address bar.
- Route tests cover: bad token shape, invalid token, expired session, missing header, each error mapping, and that no response body contains the token or the session id.
- The staff app's screenshots are unchanged; all checks in `README.md` pass.
