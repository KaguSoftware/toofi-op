/**
 * Idempotency keys made in the guest's browser: `{station}:{type}:{ulid}` (@rop/core idemKey).
 * The station is one id per phone, kept in localStorage, so the staff side can tell two
 * phones' keys apart. Make one key per user action and reuse it for that action's retries.
 */
import { idemKey } from '@rop/core';

export const STATION_STORAGE_KEY = 'rop.guest-station';
const STATION_RE = /^G-[0-9A-Z]{10}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function newStationId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return `G-${Array.from(random(10), (b) => ALPHABET[b % 32]).join('')}`;
}

/** This phone's station id: the stored one, or a new one stored for next time. Works without storage. */
export function stationId(store: Store | null): string {
  try {
    const saved = store?.getItem(STATION_STORAGE_KEY);
    if (saved && STATION_RE.test(saved)) return saved;
    const fresh = newStationId();
    store?.setItem(STATION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private mode or blocked storage: a per-load id still keeps each action's retries together.
    return newStationId();
  }
}

export type GuestAction = 'raise_waiter_call' | 'send_guest_order';

export function guestKey(action: GuestAction, store: Store | null): string {
  return idemKey(stationId(store), action);
}
