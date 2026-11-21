import { describe, expect, it } from 'vitest';
import {
  IQD_NOTES,
  attemptKey,
  paymentLanded,
  paymentSig,
  canPay,
  changeFor,
  discountArgs,
  filterByLabel,
  parseAmount,
  parseSettleResult,
  parseShiftClose,
  cashMoveBlock,
  cashMoveSig,
  parseCashMovements,
  percentToBps,
  quickTenders,
  refundable,
  startOfBusinessDay,
} from './tillLogic';

describe('changeFor', () => {
  it('is tendered minus amount, never negative', () => {
    expect(changeFor(50000, 36500)).toBe(13500);
    expect(changeFor(1000, 1000)).toBe(0);
    expect(changeFor(500, 1000)).toBe(0);
  });
});

describe('quickTenders', () => {
  it('offers notes that cover the amount, smallest first', () => {
    expect(quickTenders(3000)).toEqual([5000, 10000, 25000, 50000]);
    expect(quickTenders(250)).toEqual([250, 500, 1000, 5000, 10000, 25000, 50000]);
  });
  it('rounds up to a multiple of the biggest note when nothing covers it', () => {
    expect(quickTenders(60000)).toEqual([100000]);
    expect(quickTenders(100000)).toEqual([100000]);
  });
  it('lists the IQD notes the till knows', () => {
    expect(IQD_NOTES).toEqual([250, 500, 1000, 5000, 10000, 25000, 50000]);
  });
  it('offers nothing for a zero amount', () => {
    expect(quickTenders(0)).toEqual([]);
  });
});

describe('percentToBps', () => {
  it('converts a percent string to basis points', () => {
    expect(percentToBps('10')).toBe(1000);
    expect(percentToBps('12.5')).toBe(1250);
    expect(percentToBps('0.25')).toBe(25);
    expect(percentToBps('100')).toBe(10000);
  });
  it('rejects empty, zero, over 100, too many decimals and junk', () => {
    for (const bad of ['', '0', '100.01', '101', '1.234', 'abc', '-5', '1,5']) {
      expect(percentToBps(bad)).toBeNull();
    }
  });
  it('accepts Arabic-Indic digits', () => {
    expect(percentToBps('١٥')).toBe(1500);
  });
});

describe('discountArgs', () => {
  it('sends percent as basis points and an amount as IQD', () => {
    expect(discountArgs('percent', '15')).toEqual({ p_kind: 'discount_percent', p_value: 1500 });
    expect(discountArgs('amount', '2,500')).toEqual({ p_kind: 'discount_amount', p_value: 2500 });
  });
  it('is null for an unusable value', () => {
    expect(discountArgs('percent', '')).toBeNull();
    expect(discountArgs('amount', '0')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('reads whole IQD, ignoring separators', () => {
    expect(parseAmount('12,500')).toBe(12500);
    expect(parseAmount(' 7 ')).toBe(7);
    expect(parseAmount('٣٠٠٠')).toBe(3000);
  });
  it('rejects fractions, signs and empty', () => {
    for (const bad of ['', '1.5', '-3', 'x']) expect(parseAmount(bad)).toBeNull();
  });
});

describe('canPay', () => {
  const base = { method: 'cash', amount: 5000, due: 5000, tendered: 5000, shiftOpen: true, submitting: false } as const;
  it('allows an exact cash payment', () => {
    expect(canPay(base)).toEqual({ ok: true });
  });
  it('is disabled while submitting', () => {
    expect(canPay({ ...base, submitting: true })).toEqual({ ok: false, why: 'submitting' });
  });
  it('refuses cash with no open shift but allows card', () => {
    expect(canPay({ ...base, shiftOpen: false })).toEqual({ ok: false, why: 'noShift' });
    expect(canPay({ ...base, method: 'card', shiftOpen: false, tendered: 0 })).toEqual({ ok: true });
  });
  it('refuses zero, over-due and short tender', () => {
    expect(canPay({ ...base, amount: 0 })).toEqual({ ok: false, why: 'amount' });
    expect(canPay({ ...base, amount: 5001 })).toEqual({ ok: false, why: 'amount' });
    expect(canPay({ ...base, tendered: 4000 })).toEqual({ ok: false, why: 'tendered' });
  });
});

describe('attemptKey', () => {
  it('keeps the key for the same payment and makes a new one when it changes', () => {
    let n = 0;
    const make = () => `k${++n}`;
    const a = attemptKey(null, 'tab|cash|5000|5000|0', make);
    const again = attemptKey(a, 'tab|cash|5000|5000|0', make);
    expect(again).toBe(a);
    const other = attemptKey(a, 'tab|cash|3000|5000|0', make);
    expect(other.key).not.toBe(a.key);
  });
});

describe('refundable', () => {
  it('is the payment less earlier refunds', () => {
    expect(refundable(10000, 2500)).toBe(7500);
    expect(refundable(10000, 10000)).toBe(0);
  });
});

describe('server result parsing', () => {
  it('reads settle_tab', () => {
    const r = parseSettleResult({
      payment_id: 'p1',
      tab_id: 't1',
      method: 'cash',
      amount: 5000,
      tendered: 10000,
      change: 5000,
      status: 'settled',
      totals: { subtotal: 5000, discount: 0, tax: 0, total: 5000, paid: 5000, refunded: 0, due: 0 },
    });
    expect(r).toMatchObject({ paymentId: 'p1', change: 5000, settled: true, amount: 5000 });
    expect(r.totals.due).toBe(0);
  });
  it('reads close_till_shift', () => {
    expect(
      parseShiftClose({ shift_id: 's', opening_float: 1000, counted_cash: 9000, expected_cash: 10000, variance: -1000 }),
    ).toEqual({ shiftId: 's', openingFloat: 1000, counted: 9000, expected: 10000, variance: -1000, payIns: 0, paidOuts: 0, drops: 0 });
  });
  it('reads the cash movements that explain the expected figure', () => {
    expect(
      parseShiftClose({ shift_id: 's', opening_float: 1000, counted_cash: 0, expected_cash: 0, variance: 0, pay_ins: 500, paid_outs: 700, drops: 800 }),
    ).toMatchObject({ payIns: 500, paidOuts: 700, drops: 800 });
  });
});

describe('cash movements', () => {
  it('blocks an amount that is not a whole number above 0', () => {
    expect(cashMoveBlock(0, 'ice', false)).toBe('amount');
    expect(cashMoveBlock(-5, 'ice', false)).toBe('amount');
    expect(cashMoveBlock(1.5, 'ice', false)).toBe('amount');
  });
  it('needs a reason, unless the PIN dialog will ask for it', () => {
    expect(cashMoveBlock(5000, '   ', false)).toBe('reason');
    expect(cashMoveBlock(5000, '', true)).toBeNull();
    expect(cashMoveBlock(5000, 'ice', false)).toBeNull();
  });
  it('reads rows newest first and drops unknown kinds', () => {
    expect(
      parseCashMovements([
        { id: 'a', kind: 'paid_out', amount: 2000, reason: 'ice', created_at: '2026-11-21T10:00:00Z' },
        { id: 'b', kind: 'mystery', amount: 1, reason: 'x', created_at: '2026-11-21T11:00:00Z' },
        { id: 'c', kind: 'drop', amount: '30000', reason: 'safe', created_at: '2026-11-21T12:00:00Z' },
      ]),
    ).toEqual([
      { id: 'c', kind: 'drop', amount: 30000, reason: 'safe', createdAt: '2026-11-21T12:00:00Z' },
      { id: 'a', kind: 'paid_out', amount: 2000, reason: 'ice', createdAt: '2026-11-21T10:00:00Z' },
    ]);
    expect(parseCashMovements(null)).toEqual([]);
  });
  it('keys a retry the same and a new entry differently', () => {
    expect(cashMoveSig('paid_out', 5000, 0)).toBe(cashMoveSig('paid_out', 5000, 0));
    expect(cashMoveSig('paid_out', 5000, 1)).not.toBe(cashMoveSig('paid_out', 5000, 0));
    expect(cashMoveSig('drop', 5000, 0)).not.toBe(cashMoveSig('paid_out', 5000, 0));
  });
});

describe('startOfBusinessDay', () => {
  it('is Baghdad midnight (UTC+3) as an instant', () => {
    expect(startOfBusinessDay(new Date('2026-11-19T22:30:00Z')).toISOString()).toBe('2026-11-19T21:00:00.000Z');
    expect(startOfBusinessDay(new Date('2026-11-19T10:00:00Z')).toISOString()).toBe('2026-11-18T21:00:00.000Z');
  });
});

describe('filterByLabel', () => {
  const rows = [{ tableLabel: 'T1' }, { tableLabel: 'Patio 12' }, { tableLabel: null }];
  it('matches part of a label, ignoring case', () => {
    expect(filterByLabel(rows, 'patio')).toEqual([{ tableLabel: 'Patio 12' }]);
    expect(filterByLabel(rows, 't1')).toEqual([{ tableLabel: 'T1' }]);
  });
  it('matches Arabic-Indic digits and keeps everything for an empty search', () => {
    expect(filterByLabel(rows, '١٢')).toEqual([{ tableLabel: 'Patio 12' }]);
    expect(filterByLabel(rows, ' ')).toHaveLength(3);
  });
});

describe('paymentSig and paymentLanded', () => {
  it('ignores tendered cash: same tab, method and amount give the same signature', () => {
    expect(paymentSig('t', 'cash', 5000, 0)).toBe(paymentSig('t', 'cash', 5000, 0));
    expect(paymentSig('t', 'cash', 5000, 0)).not.toBe(paymentSig('t', 'card', 5000, 0));
    expect(paymentSig('t', 'cash', 5000, 0)).not.toBe(paymentSig('t', 'cash', 4000, 0));
  });
  it('a payment landed when the due amount dropped', () => {
    expect(paymentLanded(5000, 0)).toBe(true);
    expect(paymentLanded(5000, 5000)).toBe(false);
  });
});
