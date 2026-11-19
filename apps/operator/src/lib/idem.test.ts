import { describe, expect, it } from 'vitest';
import { IDEM_KEY_RE, idemKey } from '@rop/core';
import { resolveStationId } from './idem';

function store(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('resolveStationId', () => {
  it('prefers the desktop station id', () => {
    expect(resolveStationId({ desktopStationId: () => 'TILL-01', storage: store(), random: () => 'WEB-X' })).toBe('TILL-01');
  });
  it('creates and then reuses a device id in a browser', () => {
    const s = store();
    const deps = { desktopStationId: () => null, storage: s, random: () => 'WEB-AAAA' };
    expect(resolveStationId(deps)).toBe('WEB-AAAA');
    expect(resolveStationId({ ...deps, random: () => 'WEB-BBBB' })).toBe('WEB-AAAA');
  });
  it('still returns an id when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(resolveStationId({ desktopStationId: () => null, storage: broken, random: () => 'WEB-C' })).toBe('WEB-C');
  });
  it('produces ids that make valid idempotency keys', () => {
    const id = resolveStationId({ desktopStationId: () => null, storage: null, random: () => 'WEB-0A1B2C3D4E' });
    expect(idemKey(id, 'open_tab')).toMatch(IDEM_KEY_RE);
  });
});
