import { describe, expect, it } from 'vitest';
import { GUEST_CODES } from './guestErrorLogic';
import { errorText, fill, guestCopy } from './copyLogic';

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => strings(v, out));
  return out;
}

describe('guestCopy', () => {
  it.each(['en', 'ar'] as const)('has text for every line in %s, and no staff wording', (locale) => {
    const copy = guestCopy(locale);
    const all = strings(copy);
    expect(all.length).toBeGreaterThan(40);
    for (const line of all) {
      expect(line.trim()).not.toBe('');
      // A missing key would come back as the key itself.
      expect(line).not.toMatch(/^guest\.|^errors\./);
      expect(line).not.toMatch(/manager|menu setup|update the app|PIN/i);
    }
  });
  it('speaks each language', () => {
    expect(guestCopy('en').bar.callWaiter).toBe('Call waiter');
    expect(guestCopy('ar').bar.callWaiter).toBe('اطلب النادل');
    expect(guestCopy('en').lang.short).toBe('ع');
    expect(guestCopy('ar').lang.short).toBe('EN');
  });
  it('carries text for every code the guest site maps', () => {
    const copy = guestCopy('en');
    for (const code of GUEST_CODES) expect(copy.errors.byCode[code], code).toBeTruthy();
  });
});

describe('errorText', () => {
  const copy = guestCopy('en');
  it('uses diner wording where the catalogue line was written for staff', () => {
    expect(errorText(copy, 'INVALID_QTY')).toBe(copy.errors.byCode.INVALID_QTY);
    expect(errorText(copy, 'INVALID_QTY')).toMatch(/20/);
  });
  it('falls back to the generic line for an unknown code or none', () => {
    expect(errorText(copy, 'SOMETHING_ELSE')).toBe(copy.errors.generic);
    expect(errorText(copy, null)).toBe(copy.errors.generic);
  });
});

describe('fill', () => {
  it('fills named placeholders and leaves unknown ones', () => {
    expect(fill('Table {label}, in {time}', { label: '5', time: '1:42' })).toBe('Table 5, in 1:42');
    expect(fill('Hi {who}', {})).toBe('Hi {who}');
  });
});
