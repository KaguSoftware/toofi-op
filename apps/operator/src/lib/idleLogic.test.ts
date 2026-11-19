import { describe, expect, it } from 'vitest';
import { clearIdleState, isIdle, msUntilIdle, ownPinAccepted, parseIdleMinutes, saveIdleState, shouldLockOnBoot } from './idleLogic';

describe('idle timing', () => {
  const t0 = 1_000_000;
  it('is idle exactly at the limit, not before', () => {
    expect(isIdle(t0, t0 + 299_999, 5)).toBe(false);
    expect(isIdle(t0, t0 + 300_000, 5)).toBe(true);
  });
  it('says how long until the lock', () => {
    expect(msUntilIdle(t0, t0 + 100_000, 5)).toBe(200_000);
    expect(msUntilIdle(t0, t0 + 400_000, 5)).toBe(0);
  });
  it('parses the setting with a default of 5', () => {
    expect(parseIdleMinutes(null)).toBe(5);
    expect(parseIdleMinutes('10')).toBe(10);
    expect(parseIdleMinutes('0')).toBe(5);
    expect(parseIdleMinutes('abc')).toBe(5);
    expect(parseIdleMinutes('1.5')).toBe(5);
  });
});

describe('ownPinAccepted', () => {
  it('accepts true or {ok:true} only', () => {
    expect(ownPinAccepted(true)).toBe(true);
    expect(ownPinAccepted({ ok: true })).toBe(true);
    expect(ownPinAccepted(false)).toBe(false);
    expect(ownPinAccepted({ ok: false, code: 'PIN_INVALID' })).toBe(false);
    expect(ownPinAccepted(null)).toBe(false);
  });
});

describe('idle persistence', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it('re-locks on boot when the locked flag was saved', () => {
    const s = mem();
    saveIdleState(s, { locked: true, lastActivityMs: 1000 });
    expect(shouldLockOnBoot(s, 1001, 5)).toBe(true);
  });
  it('re-locks on boot when the saved last activity is past the limit', () => {
    const s = mem();
    saveIdleState(s, { locked: false, lastActivityMs: 1000 });
    expect(shouldLockOnBoot(s, 1000 + 299_999, 5)).toBe(false);
    expect(shouldLockOnBoot(s, 1000 + 300_000, 5)).toBe(true);
  });
  it('does not lock with nothing saved, or after clearing', () => {
    const s = mem();
    expect(shouldLockOnBoot(s, 9e9, 5)).toBe(false);
    saveIdleState(s, { locked: true, lastActivityMs: 1 });
    clearIdleState(s);
    expect(shouldLockOnBoot(s, 9e9, 5)).toBe(false);
  });
});
