import { describe, expect, it } from 'vitest';
import { alertCount, parseShiftVariances } from './dayLogic';

const row = { staff_name: 'Sara', device_id: 'TILL-01', opened_at: '2026-01-01T08:00:00Z', closed_at: '2026-01-01T16:00:00Z', opening_float: 50000, expected_cash: 120000, counted_cash: 110000, variance: -10000, alert: true };

describe('parseShiftVariances', () => {
  it('reads a plain array and the server {shifts} shape', () => {
    expect(parseShiftVariances([row])).toEqual([row]);
    expect(parseShiftVariances({ from: '2026-11-20', to: '2026-11-20', threshold: 5000, shifts: [row] })).toEqual([row]);
  });
  it('keeps an open shift with no count', () => {
    const [r] = parseShiftVariances([{ ...row, closed_at: null, counted_cash: null, variance: null, alert: false }]);
    expect(r).toMatchObject({ closed_at: null, counted_cash: null, variance: null, alert: false });
  });
  it('returns nothing for unreadable input and skips junk rows', () => {
    expect(parseShiftVariances(null)).toEqual([]);
    expect(parseShiftVariances('x')).toEqual([]);
    expect(parseShiftVariances([null, 3, {}, row])).toEqual([row]);
  });
  it('counts alerts', () => {
    expect(alertCount([row, { ...row, alert: false }])).toBe(1);
  });
});
