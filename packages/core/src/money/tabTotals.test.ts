import { describe, expect, it } from 'vitest';
import { MoneyError } from './iqd';
import {
  computeChange,
  computeTabTotals,
  discountAmount,
  splitByItem,
  splitTabEvenly,
  type TabAdjustment,
  type TabLine,
  type TabTotalsInput,
} from './tabTotals';
import cases from './__fixtures__/tab-totals-cases.json';

const toRows = (amounts: readonly number[]) => amounts.map((amount) => ({ amount }));

interface PercentRow {
  bps: number;
  stored_amount: number;
}

/**
 * The JSON case shape as the SQL test builds it: each of `discounts` is a discount_amount row
 * at that stored amount; each of `percent_discounts` is a discount_percent row.
 */
function tabOf(c: {
  lines: TabLine[];
  discounts: number[];
  percent_discounts?: PercentRow[];
  payments: number[];
  refunds: number[];
}): TabTotalsInput {
  const adjustments: TabAdjustment[] = [
    ...c.discounts.map((amount) => ({ kind: 'discount_amount' as const, value: amount, amount })),
    ...(c.percent_discounts ?? []).map((p) => ({ kind: 'discount_percent' as const, value: p.bps, amount: p.stored_amount })),
  ];
  return { lines: c.lines, adjustments, payments: toRows(c.payments), refunds: toRows(c.refunds) };
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('computeTabTotals: every shared case (same JSON the SQL test runs)', () => {
  it('has the cases', () => {
    expect(cases.cases.length).toBeGreaterThan(30);
  });
  for (const c of cases.cases) {
    it(c.name, () => {
      expect(computeTabTotals(tabOf(c))).toEqual(c.expected);
    });
  }
});

describe('computeTabTotals: the server raises where the mirror throws', () => {
  it('rejects a non-integer amount', () => {
    const tab = tabOf({ lines: [{ id: ID(1), line_total: 1.5, tax_rate_bps: 0, voided: false }], discounts: [], payments: [], refunds: [] });
    expect(() => computeTabTotals(tab)).toThrow(MoneyError);
  });
});

describe('discountAmount: the amount app.apply_discount stores', () => {
  for (const c of cases.percent_cases) {
    it(`percent: ${c.name}`, () => {
      const subtotal = c.subtotal;
      expect(discountAmount('discount_percent', c.bps, { subtotal, discount: c.existing_discount })).toBe(c.expected_amount);
    });
  }

  it('an amount discount is capped at what is left of the subtotal', () => {
    expect(discountAmount('discount_amount', 5000, { subtotal: 3000, discount: 1000 })).toBe(2000);
    expect(discountAmount('discount_amount', 500, { subtotal: 3000, discount: 1000 })).toBe(500);
  });

  it('returns 0 when the server would refuse with NOTHING_TO_DISCOUNT', () => {
    expect(discountAmount('discount_percent', 1000, { subtotal: 4, discount: 0 })).toBe(0); // rd(4000, 10000) = 0
    expect(discountAmount('discount_amount', 10, { subtotal: 100, discount: 100 })).toBe(0);
  });

  it('rejects what the server calls INVALID_DISCOUNT', () => {
    expect(() => discountAmount('discount_amount', 0, { subtotal: 100, discount: 0 })).toThrow(MoneyError);
    expect(() => discountAmount('discount_percent', 10001, { subtotal: 100, discount: 0 })).toThrow(MoneyError);
  });
});

describe('splitTabEvenly: app.split_evenly', () => {
  it('splits what is due, the first (due mod n) shares get one more dinar', () => {
    expect(splitTabEvenly(5500, 3)).toEqual({ due: 5500, shares: [1834, 1833, 1833] });
    expect(splitTabEvenly(0, 2)).toEqual({ due: 0, shares: [0, 0] });
  });

  it('allows 1 to 100 people (INVALID_SPLIT otherwise)', () => {
    expect(splitTabEvenly(7, 100).shares).toHaveLength(100);
    expect(() => splitTabEvenly(7, 0)).toThrow(MoneyError);
    expect(() => splitTabEvenly(7, 101)).toThrow(MoneyError);
  });
});

describe('splitByItem: app.split_by_item', () => {
  // Discount 100 over 1000/1000/1000 in id order: 33, 34, 33.
  const tab = tabOf({
    lines: [
      { id: ID(3), line_total: 1000, tax_rate_bps: 0, voided: false },
      { id: ID(1), line_total: 1000, tax_rate_bps: 1000, voided: false },
      { id: ID(2), line_total: 1000, tax_rate_bps: 1000, voided: false },
      { id: ID(4), line_total: 500, tax_rate_bps: 0, voided: true },
    ],
    discounts: [100],
    payments: [],
    refunds: [],
  });

  it('each chosen line carries its share of the discount, in id order', () => {
    expect(splitByItem(tab, [ID(3), ID(2)])).toEqual({
      amount: 1933,
      due: 2900,
      lines: [
        { order_item_id: ID(2), line_total: 1000, discount: 34, amount: 966 },
        { order_item_id: ID(3), line_total: 1000, discount: 33, amount: 967 },
      ],
    });
  });

  it('a repeated id counts once', () => {
    expect(splitByItem(tab, [ID(1), ID(1)]).amount).toBe(967);
  });

  it('the amount is capped at what is due', () => {
    const paid = { ...tab, payments: toRows([2000]) };
    expect(splitByItem(paid, [ID(1), ID(2)])).toMatchObject({ amount: 900, due: 900 });
  });

  it('refuses an empty list (INVALID_SPLIT) and a line not live on the tab (LINE_NOT_ON_TAB)', () => {
    expect(() => splitByItem(tab, [])).toThrow(MoneyError);
    expect(() => splitByItem(tab, [ID(4)])).toThrow(MoneyError);
    expect(() => splitByItem(tab, [ID(9)])).toThrow(MoneyError);
  });

  it('matches ids the way Postgres compares uuids (case-insensitive)', () => {
    const upper = { ...tab, lines: tab.lines.map((l) => ({ ...l, id: l.id.toUpperCase() })) };
    expect(splitByItem(upper, [ID(2)]).amount).toBe(966);
  });
});

describe('computeChange: the change rule of app.settle_tab', () => {
  it('cash: change is tendered minus amount', () => {
    expect(computeChange('cash', 7500, 10000)).toBe(2500);
    expect(computeChange('cash', 7500, 7500)).toBe(0);
  });

  it('cash: null when the server would refuse with TENDERED_TOO_LOW', () => {
    expect(computeChange('cash', 7500, 7499)).toBeNull();
    expect(computeChange('cash', 7500, null)).toBeNull();
  });

  it('card: tendered is ignored and change is 0', () => {
    expect(computeChange('card', 7500, null)).toBe(0);
    expect(computeChange('card', 7500, 1)).toBe(0);
  });
});
