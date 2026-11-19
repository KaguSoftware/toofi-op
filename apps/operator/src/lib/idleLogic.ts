// Pure timing and PIN-result logic of the idle lock. The shell (IdleLock.tsx) only wires events.

export const DEFAULT_IDLE_MINUTES = 5;
export const IDLE_MINUTES_KEY = 'rop.idleMinutes';

/** A saved setting to a whole number of minutes >= 1; anything else is the default. */
export function parseIdleMinutes(raw: string | null | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 && n <= 240 ? n : DEFAULT_IDLE_MINUTES;
}

/** True once `minutes` have passed since the last activity. */
export function isIdle(lastActivityMs: number, nowMs: number, minutes: number): boolean {
  return nowMs - lastActivityMs >= minutes * 60_000;
}

/** Milliseconds until the lock should fire (0 when due), for scheduling the next check. */
export function msUntilIdle(lastActivityMs: number, nowMs: number, minutes: number): number {
  return Math.max(0, lastActivityMs + minutes * 60_000 - nowMs);
}

/** app.verify_own_pin answers a boolean or {ok}; anything else is a refusal. */
export function ownPinAccepted(result: unknown): boolean {
  if (result === true) return true;
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === true;
}

// ---- persistence: a reload must not unlock the screen ----

export const IDLE_LOCKED_KEY = 'rop.idle.locked';
export const IDLE_LAST_KEY = 'rop.idle.lastActivity';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** True on boot when the saved flag says locked, or the saved last activity is already past the limit. */
export function shouldLockOnBoot(store: Store | null, nowMs: number, minutes: number): boolean {
  try {
    if (store?.getItem(IDLE_LOCKED_KEY) === '1') return true;
    const last = Number(store?.getItem(IDLE_LAST_KEY));
    return Number.isFinite(last) && last > 0 && isIdle(last, nowMs, minutes);
  } catch {
    return false;
  }
}

export function saveIdleState(store: Store | null, state: { locked: boolean; lastActivityMs: number }): void {
  try {
    if (state.locked) store?.setItem(IDLE_LOCKED_KEY, '1');
    else store?.removeItem(IDLE_LOCKED_KEY);
    store?.setItem(IDLE_LAST_KEY, String(state.lastActivityMs));
  } catch {
    /* storage blocked: the lock lives in memory only */
  }
}

export function clearIdleState(store: Store | null): void {
  try {
    store?.removeItem(IDLE_LOCKED_KEY);
    store?.removeItem(IDLE_LAST_KEY);
  } catch {
    /* ignore */
  }
}
