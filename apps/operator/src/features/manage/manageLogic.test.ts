import { describe, expect, it } from 'vitest';
import { addDays, businessDate, changePct, dailyCsv, presetRange, rangeDays, validateRange } from './manageLogic';

describe('businessDate', () => {
  it('uses Baghdad (UTC+3), not the UTC date', () => {
    expect(businessDate(new Date('2026-11-19T21:30:00Z'))).toBe('2026-11-20');
    expect(businessDate(new Date('2026-11-19T20:59:00Z'))).toBe('2026-11-19');
  });
});

describe('presetRange', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  it('today and yesterday', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-11-18', to: '2026-11-18' });
  });
  it('last 7 days includes today (7 dates)', () => {
    const r = presetRange('last7', now);
    expect(r).toEqual({ from: '2026-11-13', to: '2026-11-19' });
    expect(rangeDays(r)).toBe(7);
  });
  it('this month runs from the 1st to today', () => {
    expect(presetRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-19' });
  });
  it('follows the Baghdad date across midnight UTC', () => {
    const late = new Date('2026-12-31T22:00:00Z');
    expect(presetRange('today', late)).toEqual({ from: '2027-01-01', to: '2027-01-01' });
    expect(presetRange('yesterday', late).to).toBe('2026-12-31');
  });
  it('custom starts as today', () => {
    expect(presetRange('custom', now)).toEqual({ from: '2026-11-19', to: '2026-11-19' });
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('validateRange', () => {
  it('accepts a normal range', () => expect(validateRange({ from: '2026-11-01', to: '2026-11-19' })).toBeNull());
  it('rejects bad, reversed and too long ranges', () => {
    expect(validateRange({ from: '', to: '2026-11-19' })).toBe('invalid');
    expect(validateRange({ from: '2026-11-19', to: '2026-11-01' })).toBe('order');
    expect(validateRange({ from: '2025-01-01', to: '2026-11-19' })).toBe('tooLong');
  });
});

describe('changePct', () => {
  it('computes to one decimal', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(80, 100)).toBe(-20);
    expect(changePct(1, 3)).toBe(-66.7);
  });
  it('has no percentage from a previous value of 0', () => {
    expect(changePct(500, 0)).toBeNull();
    expect(changePct(0, 0)).toBe(0);
  });
});

describe('dailyCsv', () => {
  const row = { date: '2026-11-19', gross: 1000, discounts: 0, voids: 0, refunds: 0, net: 1000, cash: 600, card: 400, tabs: 2, covers: 5 };
  it('writes a header and CRLF rows', () => {
    expect(dailyCsv([row])).toBe(
      'date,gross,discounts,voids,refunds,net,cash,card,tabs,covers\r\n2026-11-19,1000,0,0,0,1000,600,400,2,5\r\n',
    );
  });
  it('has only the header for no days', () => {
    expect(dailyCsv([])).toBe('date,gross,discounts,voids,refunds,net,cash,card,tabs,covers\r\n');
  });
  it('quotes cells that need it', () => {
    expect(dailyCsv([{ ...row, date: 'a,"b"' }]).split('\r\n')[1]?.startsWith('"a,""b""",')).toBe(true);
  });
});
