import { iqd, MoneyError, type IQD } from './iqd';

/**
 * Percent discount on a list price, integer half-up:
 *
 *   unit = (list * (100 - pct) + 50) / 100      (integer division)
 *
 * The server prices every line and is the authority; this helper only lets a client
 * preview show the same figure the server will compute. Any SQL twin must use the
 * same expression so the two agree bit-for-bit.
 *
 * `pct` is a whole number in [0, 99] (a RangeError otherwise); `list` must already be valid integer IQD (MoneyError otherwise).
 */
export function applyPctDiscountIqd(list: number, pct: number): IQD {
  const l = iqd(list);
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0 || pct > 99) {
    throw new RangeError(`pct must be an integer in [0, 99], got ${String(pct)}`);
  }
  const scaled = l * (100 - pct);
  if (!Number.isSafeInteger(scaled)) {
    throw new MoneyError('UNSAFE_AMOUNT', `discount computation overflowed: ${l} * ${100 - pct}`);
  }
  return iqd(Math.floor((scaled + 50) / 100));
}
