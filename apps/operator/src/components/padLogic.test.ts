import { describe, expect, it } from 'vitest';
import { pressKey } from './padLogic';

describe('pressKey', () => {
  it('builds a number digit by digit', () => {
    expect(pressKey(pressKey(0, '5'), '0')).toBe(50);
  });
  it('adds 000 for round amounts', () => expect(pressKey(5, '000')).toBe(5000));
  it('ignores leading zeros', () => expect(pressKey(0, '00')).toBe(0));
  it('backspace and clear', () => {
    expect(pressKey(1234, 'back')).toBe(123);
    expect(pressKey(1234, 'clear')).toBe(0);
  });
  it('refuses to pass max', () => expect(pressKey(900, '0', 5000)).toBe(900));
});
