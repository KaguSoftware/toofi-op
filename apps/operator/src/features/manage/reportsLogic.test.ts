import { describe, expect, it } from 'vitest';
import {
  bpsToPercent,
  groupByClass,
  heatGrid,
  parseAttention,
  pointsTrend,
  staffViews,
  trend,
  type MenuItemRow,
  type StaffRow,
} from './reportsLogic';

describe('trend', () => {
  it('gives the direction and the percent, to one decimal', () => {
    expect(trend({ current: 119000, previous: 8000 })).toEqual({ dir: 'up', pct: 1387.5 });
    expect(trend({ current: 90, previous: 120 })).toEqual({ dir: 'down', pct: 25 });
    expect(trend({ current: 50, previous: 50 })).toEqual({ dir: 'same', pct: 0 });
  });
  it('has nothing to compare with when the previous figure was zero', () => {
    expect(trend({ current: 500, previous: 0 })).toBeNull();
    expect(trend({ current: 0, previous: 0 })).toEqual({ dir: 'same', pct: 0 });
  });
});

describe('pointsTrend', () => {
  it('compares two rates in percentage points', () => {
    expect(pointsTrend({ current: 1780, previous: 1875 })).toEqual({ dir: 'down', points: 1 });
    expect(pointsTrend({ current: 3250, previous: 3000 })).toEqual({ dir: 'up', points: 2.5 });
    expect(pointsTrend({ current: 3000, previous: 3000 })).toEqual({ dir: 'same', points: 0 });
  });
  it('is unknown when either rate is', () => {
    expect(pointsTrend({ current: null, previous: 3000 })).toBeNull();
    expect(pointsTrend({ current: 3000, previous: null })).toBeNull();
  });
});

describe('bpsToPercent', () => {
  it('turns basis points into a percent number', () => expect(bpsToPercent(1780)).toBe(17.8));
});

describe('parseAttention', () => {
  it('keeps known kinds, red before amber', () => {
    const out = parseAttention({
      items: [
        { kind: 'low_stock', count: 3 },
        { kind: 'made_up', count: 9 },
        { kind: 'cash_variance', count: 1, value: 12000 },
        { kind: 'uncosted_items', count: 2 },
        { kind: 'day_left_open', count: 1, business_date: '2026-11-20' },
      ],
    });
    expect(out.map((i) => i.kind)).toEqual(['day_left_open', 'cash_variance', 'low_stock', 'uncosted_items']);
  });
  it('is empty for anything that is not the expected shape', () => {
    expect(parseAttention(null)).toEqual([]);
    expect(parseAttention({ items: 'no' })).toEqual([]);
  });
});

const item = (over: Partial<MenuItemRow>): MenuItemRow => ({
  menu_item_id: 'i', name_en: 'Item', name_ar: 'صنف', category_id: 'c', is_active: true,
  qty: 0, revenue: 0, cost: 0, margin: 0, unit_margin: 0, share_bps: 0, class: 'dog', ...over,
});

describe('groupByClass', () => {
  it('puts each item in its class, best margin first', () => {
    const out = groupByClass([
      item({ menu_item_id: 'a', class: 'star', margin: 100 }),
      item({ menu_item_id: 'b', class: 'star', margin: 900 }),
      item({ menu_item_id: 'c', class: 'puzzle', margin: 50 }),
      item({ menu_item_id: 'd', class: 'uncosted' }),
    ]);
    expect(out.star.map((i) => i.menu_item_id)).toEqual(['b', 'a']);
    expect(out.puzzle).toHaveLength(1);
    expect(out.uncosted).toHaveLength(1);
    expect(out.plowhorse).toEqual([]);
    expect(out.dog).toEqual([]);
  });
});

const person = (over: Partial<StaffRow>): StaffRow => ({
  staff_id: 's', full_name: 'S', role: 'waiter', tabs: 0, covers: 0, revenue: 0, items: 0, spend_per_cover: 0,
  items_per_cover_x100: 0, payments_taken: 0, voids_count: 0, voids_value: 0, discounts_count: 0, discounts_value: 0,
  refunds_count: 0, refunds_value: 0, exception_count: 0, exception_value: 0, exception_bps: null, drawer_opens: 0,
  paid_outs_count: 0, paid_outs_value: 0, shifts: 0, cash_variance: 0, variance_alerts: 0, flagged: false, ...over,
});

describe('staffViews', () => {
  it('shows each person only where they have something to show', () => {
    const v = staffViews([
      person({ staff_id: 'w1', tabs: 4, revenue: 90000 }),
      person({ staff_id: 'w2', tabs: 2, revenue: 120000, exception_count: 3, exception_value: 12000, flagged: true }),
      person({ staff_id: 'c1', exception_count: 3, exception_value: 80000, shifts: 1, cash_variance: -10000, variance_alerts: 1 }),
      person({ staff_id: 'c2', shifts: 1, cash_variance: 500 }),
    ]);
    expect(v.service.map((r) => r.staff_id)).toEqual(['w2', 'w1']);
    // Flagged people first, then by value.
    expect(v.exceptions.map((r) => r.staff_id)).toEqual(['w2', 'c1']);
    expect(v.cash.map((r) => r.staff_id)).toEqual(['c1', 'c2']);
  });
});

describe('heatGrid', () => {
  it('averages per weekday, trims to the active hours and starts the week on Saturday', () => {
    // Two Mondays and one Saturday in range.
    const grid = heatGrid({
      days: [0, 2, 0, 0, 0, 0, 1],
      cells: [
        { dow: 1, hour: 12, net: 40000, tabs: 2 },
        { dow: 1, hour: 14, net: 100000, tabs: 3 },
        { dow: 6, hour: 13, net: 25000, tabs: 1 },
        { dow: 1, hour: 22, net: -2000, tabs: 0 },
      ],
    });
    expect(grid.hours).toEqual([12, 13, 14]);
    expect(grid.rows.map((r) => r.dow)).toEqual([6, 1]);
    expect(grid.max).toBe(50000);
    expect(grid.rows[0]!.cells).toEqual([
      { hour: 12, value: 0, level: 0 },
      { hour: 13, value: 25000, level: 2 },
      { hour: 14, value: 0, level: 0 },
    ]);
    expect(grid.rows[1]!.cells).toEqual([
      { hour: 12, value: 20000, level: 2 },
      { hour: 13, value: 0, level: 0 },
      { hour: 14, value: 50000, level: 4 },
    ]);
  });
  it('keeps an evening that ends after midnight in one piece', () => {
    const grid = heatGrid({
      days: [0, 0, 0, 0, 0, 1, 0],
      cells: [
        { dow: 5, hour: 22, net: 30000, tabs: 2 },
        { dow: 5, hour: 0, net: 10000, tabs: 0 },
      ],
    });
    expect(grid.hours).toEqual([22, 23, 0]);
  });
  it('is empty with no activity', () => {
    expect(heatGrid({ days: [1, 1, 1, 1, 1, 1, 1], cells: [] })).toEqual({ hours: [], rows: [], max: 0 });
  });
});
