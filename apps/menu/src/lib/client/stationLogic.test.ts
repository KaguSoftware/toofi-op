import { describe, expect, it } from 'vitest';
import { IDEM_KEY_RE } from '@rop/core';
import { STATION_STORAGE_KEY, guestKey, newStationId, stationId } from './stationLogic';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('stationId', () => {
  it('creates one id per phone and keeps it', () => {
    const store = memoryStore();
    const first = stationId(store);
    expect(first).toMatch(/^G-[0-9A-Z]{10}$/);
    expect(stationId(store)).toBe(first);
    expect(store.data.get(STATION_STORAGE_KEY)).toBe(first);
  });

  it('replaces a stored value that is not a station id', () => {
    const store = memoryStore({ [STATION_STORAGE_KEY]: 'tampered:value' });
    expect(stationId(store)).toMatch(/^G-[0-9A-Z]{10}$/);
  });

  it('still works when storage is missing or throws', () => {
    expect(stationId(null)).toMatch(/^G-/);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(stationId(throwing)).toMatch(/^G-/);
  });

  it('draws from the random source', () => {
    expect(newStationId(() => new Uint8Array(10))).toBe('G-0000000000');
  });
});

describe('guestKey', () => {
  it('builds a key the database accepts', () => {
    const key = guestKey('send_guest_order', memoryStore());
    expect(IDEM_KEY_RE.test(key)).toBe(true);
    expect(key.split(':')[1]).toBe('send_guest_order');
  });
});
