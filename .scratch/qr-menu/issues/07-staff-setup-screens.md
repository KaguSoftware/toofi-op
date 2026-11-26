# 07: Staff app: QR cards, switches, photo upload, icon picker

Status: ready-for-agent
Blocked by: 01, 02

The setup side: print the codes, switch guest features on and off, and give every dish a photo and every category an icon.

## Manage → Floor plan

- A "QR codes" view listing active tables from `app.table_qr_tokens()` (manager and owner; every call is audited, so do not refetch on focus).
- Print one card or all of them as A6. Adapt `../TouchPadel/apps/operator/src/features/admin/qr/QrCard.tsx` and `qrCardGeometry.ts`, restyled to our card: restaurant name, "Table" and the label, the code, "Scan for the menu" in both languages. Use the `qrcode` package's core encoder.
- **The code is always black on white.** Never brand colours.
- The address in the code is `{menu site}/t/{token}`, from `VITE_MENU_URL`. A production build must refuse a missing, `localhost` or private-network address rather than print a dead card.
- Per-table switch for guest calls and ordering (`set_table_guest_enabled`).
- Venue-wide switches for calls and for ordering (`set_guest_service`), where a manager can reach them fast during service.
- Owner only: "Replace this table's code" (`rotate_table_token`) behind a confirm that says the printed card stops working and guests at the table must scan the new one.

## Manage → Menu

- Each dish: add, replace or remove a photo. Resize in the browser to at most 800 px on the long side, WebP, under 300 KB; upload to `menu-photos` at `{venue_id}/items/{item_id}/{ulid}.webp`; then call `set_menu_item_photo`. Remove the old object after a successful replace. Show the photo in the item row.
- Each category: an icon picker over `CATEGORY_ICONS` from `@rop/core` (`set_menu_category_icon`). Add the eight icons to the staff app's `Icon.tsx` set.
- A count of dishes still without a photo, so the manager can see what is missing.

## Rules

- Capabilities in `@rop/core` (`can`): print and switches for manager and owner, replace for owner.
- Upload size, type and path are checked by the bucket policy and the function too; the browser check is a courtesy.
- Kit and tokens only; both languages; logical properties; logic in `*Logic.ts` with tests (address building and its production guard, resize maths, path building).

## Done when

- A printed card scans to the right table on the guest site; a replaced code stops working and ends that table's sessions.
- A photo uploaded here shows on the guest menu after the cache refreshes; a waiter cannot see the upload or switch controls.
- Tests cover the logic files and the role gates.
