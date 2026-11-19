import { describe, expect, it } from 'vitest';
import { isolateLtr, LRI, PDI } from '../bidi';
import { countPhrase, pluralForm } from '../plural';

describe('pluralForm', () => {
  it.each(['en', 'ar'] as const)('answers as Intl.PluralRules for 0..300 in %s', (locale) => {
    const rules = new Intl.PluralRules(locale);
    for (let n = 0; n <= 300; n++) {
      expect(pluralForm(n, locale), `${locale} ${n}`).toBe(rules.select(n));
    }
  });

  it('reads a negative count by its size and a fraction as other, as CLDR does', () => {
    for (const locale of ['en', 'ar'] as const) {
      const rules = new Intl.PluralRules(locale);
      for (const n of [-1, -2, -3, -11, -100, 0.5, 1.5, 2.5, 3.5, 11.5]) {
        expect(pluralForm(n, locale), `${locale} ${n}`).toBe(rules.select(n));
      }
    }
  });

  it('gives Arabic all six forms at their CLDR edges', () => {
    const edges: [number, string][] = [
      [0, 'zero'],
      [1, 'one'],
      [2, 'two'],
      [3, 'few'],
      [10, 'few'],
      [11, 'many'],
      [99, 'many'],
      [100, 'other'],
      [102, 'other'],
      [103, 'few'],
      [111, 'many'],
    ];
    for (const [n, form] of edges) expect(pluralForm(n, 'ar'), String(n)).toBe(form);
  });
});

describe('countPhrase', () => {
  const n = (count: number) => isolateLtr(String(count));

  it('picks the English form and LTR-isolates the count', () => {
    expect(countPhrase('common.covers', 1, 'en')).toBe('1 guest');
    expect(countPhrase('common.covers', 2, 'en')).toBe(`${n(2)} guests`);
    expect(countPhrase('common.covers', 0, 'en')).toBe('No guests');
  });

  it('groups the digits of a large count', () => {
    expect(countPhrase('common.covers', 10000, 'en')).toBe(`${LRI}10,000${PDI} guests`);
  });

  it('picks each Arabic form', () => {
    expect(countPhrase('common.covers', 0, 'ar')).toBe('لا ضيوف');
    expect(countPhrase('common.covers', 1, 'ar')).toBe('ضيف واحد');
    expect(countPhrase('common.covers', 2, 'ar')).toBe('ضيفان');
    expect(countPhrase('common.covers', 4, 'ar')).toBe(`${n(4)} ضيوف`);
    expect(countPhrase('common.covers', 12, 'ar')).toBe(`${n(12)} ضيفًا`);
    expect(countPhrase('common.covers', 100, 'ar')).toBe(`${n(100)} ضيف`);
  });
});
