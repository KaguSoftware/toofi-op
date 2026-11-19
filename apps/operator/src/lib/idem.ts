// Idempotency keys: "{station}:{type}:{ulid}". Make one key per user action and
// reuse it for that action's retries (see docs/SPEC.md and CLAUDE.md rule 5).
import { idemKey } from '@rop/core';
import { getBridge, isDesktop } from './bridge';

const DEVICE_KEY = 'rop.deviceId';

function randomDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return 'WEB-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface StationDeps {
  desktopStationId: () => string | null;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  random: () => string;
}

/** Pure: station id from the desktop bridge, else a persisted random device id. */
export function resolveStationId(deps: StationDeps): string {
  const desktop = deps.desktopStationId();
  if (desktop) return desktop;
  try {
    const saved = deps.storage?.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = deps.random();
    deps.storage?.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return deps.random(); // storage blocked: a per-call id is still a valid key
  }
}

let cached: string | null = null;

export function stationId(): string {
  cached ??= resolveStationId({
    desktopStationId: () => (isDesktop() ? getBridge().getStation().stationId || null : null),
    storage: typeof localStorage === 'undefined' ? null : localStorage,
    random: randomDeviceId,
  });
  return cached;
}

/** A fresh key for one action: newIdem('open_tab'). */
export function newIdem(type: string): string {
  return idemKey(stationId(), type);
}
