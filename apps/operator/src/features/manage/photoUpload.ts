// Dish photo writes. The file goes straight to Storage under the bucket's policy (the one table a
// client writes, see CLAUDE.md rule 1); then app.set_menu_item_photo records the path. The old
// object is removed only after the new path is recorded, so a failure never leaves a dish with a
// path that points at nothing.
import { ulid } from 'ulid';
import type { AppFunctionName } from '../../lib/appRpc';
import { appRpc } from '../../lib/appRpc';
import { supabase } from '../../lib/supabase';
import { menuPhotoPath } from './photoLogic';
import { resizeToWebp } from './photoResize';

const BUCKET = 'menu-photos';
// Registered by the database step for ticket 02; the generated types pick it up with `pnpm db:types`.
const SET_PHOTO = 'set_menu_item_photo' as AppFunctionName;

/** Best effort: a leftover object is harmless, a failed cleanup must not fail the save. */
async function removeObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* orphaned object: nothing points at it */
  }
}

export async function uploadItemPhoto(args: { file: File; venueId: string; itemId: string; oldPath: string | null }): Promise<string> {
  const blob = await resizeToWebp(args.file);
  const path = menuPhotoPath(args.venueId, args.itemId, ulid());
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message);
  try {
    await appRpc(SET_PHOTO, { p_item_id: args.itemId, p_photo_path: path });
  } catch (e) {
    await removeObject(path);
    throw e;
  }
  if (args.oldPath) await removeObject(args.oldPath);
  return path;
}

export async function removeItemPhoto(args: { itemId: string; oldPath: string }): Promise<void> {
  await appRpc(SET_PHOTO, { p_item_id: args.itemId, p_photo_path: null });
  await removeObject(args.oldPath);
}
