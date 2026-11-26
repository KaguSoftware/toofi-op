import 'server-only';
import { unstable_cache } from 'next/cache';
import { parseGuestMenu, type GuestMenu } from '../menuLogic';
import { guestRpc } from './guestRpc';
import { serverEnv } from './supabase';

/** Revalidate with revalidateTag(MENU_TAG) when the menu changes. */
export const MENU_TAG = 'guest-menu';

export type MenuResult = { status: 'ok'; menu: GuestMenu } | { status: 'empty'; menu: GuestMenu } | { status: 'error'; menu: null };

/**
 * One cached read of `guest_menu()` for every guest, about 60 s old at most. The cached
 * function throws on failure, so a failed read is never kept for the whole window.
 */
const cachedMenu = unstable_cache(
  async (): Promise<GuestMenu> => {
    const answer = await guestRpc('guest_menu');
    const menu = answer.ok ? parseGuestMenu(answer.data, serverEnv().url) : null;
    if (!menu) throw new Error('guest_menu failed');
    return menu;
  },
  ['guest-menu'],
  { tags: [MENU_TAG], revalidate: 60 },
);

/** The menu or an explicit status: the page never renders a silent blank. */
export async function getMenu(): Promise<MenuResult> {
  try {
    const menu = await cachedMenu();
    return menu.categories.length > 0 ? { status: 'ok', menu } : { status: 'empty', menu };
  } catch {
    return { status: 'error', menu: null };
  }
}
