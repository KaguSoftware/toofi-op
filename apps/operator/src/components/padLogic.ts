// Pure: the AmountPad's key handling. Values are whole IQD, never fractions.

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000' | 'back' | 'clear';

export const PAD_KEYS: readonly PadKey[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '000'];

export function pressKey(value: number, key: PadKey, max = Number.MAX_SAFE_INTEGER): number {
  if (key === 'clear') return 0;
  if (key === 'back') return Math.floor(value / 10);
  const next = Number(`${value === 0 ? '' : value}${key}`);
  return Number.isSafeInteger(next) && next <= max ? next : value;
}
