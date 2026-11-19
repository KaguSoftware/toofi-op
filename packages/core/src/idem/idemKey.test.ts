import { describe, expect, it } from 'vitest';
import { idemKey, IDEM_KEY_RE } from './idemKey';

describe('idemKey', () => {
  it('builds {station}:{type}:{ulid}', () => {
    const key = idemKey('TILL-01', 'settle_tab');
    const [station, type, id] = key.split(':');
    expect(station).toBe('TILL-01');
    expect(type).toBe('settle_tab');
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // Crockford base32 ULID
    expect(IDEM_KEY_RE.test(key)).toBe(true);
  });

  it('is fresh on every call', () => {
    const keys = new Set(Array.from({ length: 200 }, () => idemKey('OP1', 'open_tab')));
    expect(keys.size).toBe(200);
  });

  it('refuses a station or type that would break the key format', () => {
    expect(() => idemKey('', 'open_tab')).toThrow(RangeError);
    expect(() => idemKey('TILL:1', 'open_tab')).toThrow(RangeError);
    expect(() => idemKey('till-01', 'open_tab')).toThrow(RangeError);
    expect(() => idemKey('OP1', '')).toThrow(RangeError);
    expect(() => idemKey('OP1', 'Open-Tab')).toThrow(RangeError);
  });
});
