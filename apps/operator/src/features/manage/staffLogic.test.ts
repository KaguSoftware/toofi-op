import { describe, expect, it } from 'vitest';
import { parseVarianceAlert } from './staffLogic';

describe('parseVarianceAlert', () => {
  it('reads whole IQD amounts', () => {
    expect(parseVarianceAlert('5000')).toBe(5000);
    expect(parseVarianceAlert(' 0 ')).toBe(0);
  });
  it('leaves blank unchanged and refuses anything else', () => {
    expect(parseVarianceAlert('')).toBe('unset');
    for (const bad of ['-1', '1.5', '5,000', 'abc']) expect(parseVarianceAlert(bad)).toBe('invalid');
  });
});
