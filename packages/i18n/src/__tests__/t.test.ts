import { describe, expect, it } from 'vitest';
import { ar } from '../catalogs/ar';
import { en } from '../catalogs/en';
import { makeT, t } from '../t';

describe('t()', () => {
  it('looks up nested keys per locale', () => {
    expect(t('en', 'common.ok')).toBe('OK');
    expect(t('ar', 'common.ok')).toBe('حسنًا');
  });

  it('interpolates {placeholders} in both locales', () => {
    expect(t('en', 'common.covers.other', { count: 4 })).toBe('4 guests');
    expect(t('ar', 'common.covers.few', { count: 4 })).toBe('4 ضيوف');
  });

  it('leaves unknown placeholders visible rather than erasing them', () => {
    expect(t('en', 'common.covers.other', {})).toBe('{count} guests');
  });

  it('reads error-code lines from the error catalogue', () => {
    expect(t('en', 'errors.codes.FORBIDDEN')).toBe('You do not have permission to do this.');
    expect(t('ar', 'errors.codes.FORBIDDEN')).toMatch(/[؀-ۿ]/);
  });

  it('makeT binds a locale', () => {
    const tr = makeT('ar');
    expect(tr('common.cancel')).toBe('إلغاء');
  });

  it('catalogs mirror each other key-for-key', () => {
    const keys = (obj: object, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
      );
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it('Arabic never uses a placeholder English does not have', () => {
    const leaves = (obj: object, prefix = ''): [string, string][] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'string'
          ? [[`${prefix}${k}`, v] as [string, string]]
          : leaves(v as object, `${prefix}${k}.`),
      );
    const holes = (s: string) => new Set(s.match(/\{\w+\}/g) ?? []);
    const enMap = new Map(leaves(en));
    for (const [key, arText] of leaves(ar)) {
      const enHoles = holes(enMap.get(key) ?? '');
      for (const hole of holes(arText)) expect(enHoles.has(hole), key).toBe(true);
    }
  });
});
