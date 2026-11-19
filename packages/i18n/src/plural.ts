/**
 * Counted phrases. `t()` has no plurals, so a count that meets a noun goes through here.
 *
 * `pluralForm` is hand-coded to CLDR rather than read from `Intl.PluralRules`, so it does
 * not depend on the engine's Intl data; a test holds it equal to Node's
 * `Intl.PluralRules` for 0..300 in both languages.
 *
 * A counted key is an object with every form as a leaf (e.g. `common.covers`), so both
 * catalogs carry the same six keys whatever the language uses: English repeats `one` /
 * `other`, Arabic fills all six.
 */
import { isolateLtr } from './bidi';
import { formatNumber } from './formatting';
import { t, type Locale, type MessageKey } from './t';

/** The CLDR plural categories, in the order the catalogs list them. */
export const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];

/**
 * CLDR cardinal rules. English: `one` for 1, else `other`. Arabic: `zero` 0,
 * `one` 1, `two` 2, `few` when n % 100 is 3..10, `many` when n % 100 is
 * 11..99, else `other`. The sign is ignored and a fraction is `other`, as CLDR
 * reads them.
 */
export function pluralForm(n: number, locale: Locale): PluralForm {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return 'other';
  if (locale === 'en') return abs === 1 ? 'one' : 'other';
  if (abs === 0) return 'zero';
  if (abs === 1) return 'one';
  if (abs === 2) return 'two';
  const rem = abs % 100;
  if (rem >= 3 && rem <= 10) return 'few';
  if (rem >= 11 && rem <= 99) return 'many';
  return 'other';
}

type CountPrefix<K> = K extends `${infer P}.other` ? P : never;

/** A catalog key whose six plural forms are all leaves, e.g. `'common.covers'`. */
export type CountKey = {
  [P in CountPrefix<MessageKey>]: `${P}.${PluralForm}` extends MessageKey ? P : never;
}[CountPrefix<MessageKey>];

/**
 * "4 guests" / «4 ضيوف»: the form `pluralForm` picks, with `{count}` as LTR-isolated
 * Latin digits, grouped as every other number on the page is (`formatNumber`).
 *
 * At exactly 0 the `zero` form is read in both languages. English has no CLDR
 * `zero`, but a key may word it ("No guests"); a key with
 * nothing to say at zero repeats `other` there.
 */
export function countPhrase(key: CountKey, n: number, locale: Locale): string {
  const form: PluralForm = n === 0 ? 'zero' : pluralForm(n, locale);
  return t(locale, `${key}.${form}` as MessageKey, { count: isolateLtr(formatNumber(n, locale)) });
}
