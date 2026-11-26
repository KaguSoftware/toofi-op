// Guest inbox read, shared by the inbox and the floor badge (same query key, same cache).
import { appRpc } from '../../lib/appRpc';
import type { GuestInbox } from './guestLogic';

/** In case a realtime signal is missed. */
export const INBOX_REFETCH_MS = 30_000;

export function fetchGuestInbox(): Promise<GuestInbox> {
  return appRpc<GuestInbox>('guest_inbox');
}
