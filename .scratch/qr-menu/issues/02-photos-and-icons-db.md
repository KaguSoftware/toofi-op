# 02: Dish photos and category icons in the database

Status: ready-for-agent
Blocked by: 01

The picked design shows a photo on every dish and an icon on every category. Neither exists in the schema, and file storage is switched off locally (`packages/db/supabase/config.toml`, `[storage] enabled = false`). Test-first, migrations from `20261120000150_`.

## Build

| Piece | Contract |
|---|---|
| Category icon | `menu_categories.icon text not null default 'dish'`, checked against a fixed set of keys: `dish`, `mezze`, `grill`, `main`, `sandwich`, `dessert`, `hot_drink`, `cold_drink`. Export the same list from `@rop/core` as `CATEGORY_ICONS` so the picker and the guest site share it. |
| Dish photo | `menu_items.photo_path text null`: the object's path inside the bucket, never a full URL. |
| Storage | Turn storage on in `config.toml`. A migration creates the public bucket `menu-photos` (1 MB limit; `image/webp` and `image/jpeg` only). Anyone may read. Only a manager or owner may insert, update or delete, and only under `{venue_id}/`. Model it on `../TouchPadel/packages/db/supabase/migrations/20260825000031_tables_storage.sql` (its `menu-media` bucket), adapted to our helpers. |
| `app.set_menu_item_photo(p_item_id uuid, p_photo_path text)` | Manager and owner. Null clears. The path must start with `{venue_id}/items/{item_id}/` or `PHOTO_PATH_INVALID`. Audited. Returns `{menu_item_id, photo_path}`. |
| `app.set_menu_category_icon(p_category_id uuid, p_icon text)` | Manager and owner. Unknown key: `INVALID_ICON`. Audited. Returns `{category_id, icon}`. |
| `app.guest_menu()` | Recreate it (new migration, same grant to `anon`) so each category carries `icon` and each item carries `photo_path` (null when none). Nothing else changes. |
| Seed | Give each seed category a fitting icon. No seed photos. |

The upload itself goes from the staff app straight to Storage under the bucket's policy; the function then records the path. That is a client write to `storage.objects`, so add one sentence to `CLAUDE.md` backend rule 1 naming it as the only table a client writes, and why.

Do not change `upsert_menu_item` or `upsert_menu_category`: two small functions are less risk than changing signatures.

## Also update

- `ERROR_CODE_KEYS`: `PHOTO_PATH_INVALID`, `INVALID_ICON`, English and Arabic.
- `rls-matrix.ts` for the two functions; a storage test (anon can read, a waiter cannot upload, a manager can, nobody can write outside their venue's folder).
- `pnpm db:types`; `docs/SPEC.md` (scope row: photos are now in; schema lines; the storage exception); `spec.md` in this folder.

## Done when

- New tests were red first and pass against the local stack with storage on; the whole `@rop/db` suite still passes, not skipped.
- `guest_menu()` returns `icon` and `photo_path`; `check:error-codes` and `check:rpc-registry` pass; types regenerated.
