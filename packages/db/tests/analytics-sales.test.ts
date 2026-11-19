/**
 * Analytics over one seeded scenario (Baghdad is UTC+3, no DST). Expected figures
 * are worked out by hand from the fixture literals below, not recomputed.
 *
 *   2031-03-10 (business day 1)
 *     tab A  waiter1, 2 covers, opened 12:00. burger 2 x 8000; tea 1 x 1500 VOIDED.
 *            discount 1000. cash 15000 at 13:00.
 *     tab B  waiter2, 3 covers, opened 23:50. burger 1 x 8000 at 23:55.
 *     tab V  status void: a 5000 line and a 5000 cash payment, all excluded.
 *     tab M  merged into A: a 3000 line, excluded.
 *   2031-03-11 (business day 2), still the 10th in UTC:
 *     tab B  card 8000 at 00:10 (21:10Z on the 10th). card refund 2000 at 01:00.
 *
 * The burger's recipe is 150 g beef at 10 IQD/g when sold; the cost then rises to
 * 20, which must not change the margin of sales already made.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupStaff,
  createStaffOfRole,
  endDb,
  stackAvailable,
  withRollback,
  type Query,
  type TestStaff,
} from './helpers';
import {
  call,
  discount,
  ingredient,
  line,
  menuItem,
  payment,
  recipeLine,
  refund,
  tab,
  voidLine,
} from './stock-fixtures';

const up = await stackAvailable();

type Row = Record<string, unknown>;
const B = (local: string) => `${local}+03:00`; // a Baghdad wall-clock time

const D1 = '2031-03-10';
const D2 = '2031-03-11';

describe.skipIf(!up)('analytics', () => {
  let manager: TestStaff;
  let waiter1: TestStaff;
  let waiter2: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    waiter1 = await createStaffOfRole('waiter');
    waiter2 = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  /** Plant the scenario in the test's transaction. */
  async function seed(q: Query) {
    const burger = await menuItem(q, 8000, 'Burger');
    const tea = await menuItem(q, 1500, 'Tea');
    const beef = await ingredient(q, { cost: 10 });
    await recipeLine(q, burger, beef, 150);

    const a = await tab(q, waiter1.id, { openedAt: B(`${D1}T12:00:00`), covers: 2 });
    await line(q, a, waiter1.id, burger, 2, 8000, B(`${D1}T12:05:00`));
    const teaLine = await line(q, a, waiter1.id, tea, 1, 1500, B(`${D1}T12:06:00`));
    await voidLine(q, teaLine, manager.id, B(`${D1}T12:10:00`));
    await discount(q, a, manager.id, 1000, B(`${D1}T12:55:00`));
    await payment(q, a, waiter1.id, 15000, 'cash', B(`${D1}T13:00:00`));

    const b = await tab(q, waiter2.id, { openedAt: B(`${D1}T23:50:00`), covers: 3 });
    await line(q, b, waiter2.id, burger, 1, 8000, B(`${D1}T23:55:00`));
    const pb = await payment(q, b, waiter2.id, 8000, 'card', B(`${D2}T00:10:00`));
    await refund(q, pb, b, manager.id, 2000, 'card', B(`${D2}T01:00:00`));

    const v = await tab(q, waiter1.id, { openedAt: B(`${D1}T14:00:00`), status: 'void', covers: 4 });
    await line(q, v, waiter1.id, burger, 1, 5000, B(`${D1}T14:01:00`));
    await payment(q, v, waiter1.id, 5000, 'cash', B(`${D1}T14:02:00`));

    const m = await tab(q, waiter1.id, { openedAt: B(`${D1}T15:00:00`), status: 'settled', mergedInto: a });
    await line(q, m, waiter1.id, tea, 2, 1500, B(`${D1}T15:01:00`));

    await q(`update ingredients set cost_per_unit = 20 where id = $1`, [beef]);
    return { burger, tea };
  }

  const range = (q: Query, fn: string, from = D1, to = D2) => call<Row>(q, fn, [from, to], ['date', 'date']);

  it('daily sales: gross, voids, discounts, net per business day; totals reconcile with payments - refunds', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_daily_sales');
      expect(out.days).toEqual([
        {
          date: D1, gross: 24000, discounts: 1000, voids: 1500, voids_count: 1,
          payments: 15000, refunds: 0, net: 15000, cash: 15000, card: 0, tabs: 2, covers: 5,
        },
        {
          date: D2, gross: 0, discounts: 0, voids: 0, voids_count: 0,
          payments: 8000, refunds: 2000, net: 6000, cash: 0, card: 6000, tabs: 0, covers: 0,
        },
      ]);
      // 15000 cash + 8000 card paid, 2000 refunded on the live tabs.
      expect(out.totals).toMatchObject({ payments: 23000, refunds: 2000, net: 21000, gross: 24000 });
      expect(out).toMatchObject({ from: D1, to: D2 });
    });
  });

  it('the business day follows Baghdad midnight, not UTC', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      // The card payment at 00:10 Baghdad is 21:10Z on the 10th: it belongs to the 11th.
      const d1 = await range(q, 'analytics_daily_sales', D1, D1);
      expect(d1.totals).toMatchObject({ net: 15000, card: 0, gross: 24000 });
      const d2 = await range(q, 'analytics_daily_sales', D2, D2);
      expect(d2.totals).toMatchObject({ net: 6000, card: 6000, gross: 0 });
    });
  });

  it('hourly: 24 buckets by Baghdad hour', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_hourly', D1, D1);
      const hours = out.hours as Row[];
      expect(hours).toHaveLength(24);
      expect(hours[12]).toEqual({ hour: 12, gross: 16000, net: 0, tabs: 1 });
      expect(hours[13]).toEqual({ hour: 13, gross: 0, net: 15000, tabs: 0 });
      expect(hours[23]).toEqual({ hour: 23, gross: 8000, net: 0, tabs: 1 });
      expect(hours[0]).toEqual({ hour: 0, gross: 0, net: 0, tabs: 0 });
    });
  });

  it('best sellers: qty and revenue of non-voided lines on live tabs', async () => {
    await withRollback(manager.id, async (q) => {
      const { burger } = await seed(q);
      const out = await call<Row>(q, 'analytics_best_sellers', [D1, D2, 10], ['date', 'date', 'int']);
      expect(out.items).toEqual([
        { menu_item_id: burger, name_en: 'Burger', name_ar: 'Burger', qty: 3, revenue: 24000 },
      ]);
      await expect(
        call(q, 'analytics_best_sellers', [D1, D2, 0], ['date', 'date', 'int']),
      ).rejects.toThrow('INVALID_ARGUMENT');
    });
  });

  it('by waiter: tabs, covers, net revenue and average ticket', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_by_waiter');
      expect(out.waiters).toEqual([
        { staff_id: waiter1.id, full_name: 'Test waiter', tabs: 1, covers: 2, revenue: 15000, avg_ticket: 15000 },
        { staff_id: waiter2.id, full_name: 'Test waiter', tabs: 1, covers: 3, revenue: 6000, avg_ticket: 6000 },
      ]);
    });
  });

  it('payment mix: cash vs card, net of refunds', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_payment_mix');
      expect(out.methods).toEqual([
        { method: 'cash', count: 1, payments: 15000, refunds: 0, net: 15000 },
        { method: 'card', count: 1, payments: 8000, refunds: 2000, net: 6000 },
      ]);
      expect(out.net).toBe(21000);
    });
  });

  it('panel headline: each figure with the previous equal-length period', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'panel_headline', D2, D2);
      expect(out).toEqual({
        from: D2, to: D2, prev_from: D1, prev_to: D1, basis: 'calendar_date',
        revenue: { current: 6000, previous: 15000 },
        covers: { current: 0, previous: 5 },
        tabs: { current: 0, previous: 2 },
        avg_ticket: { current: 0, previous: 7500 },
        discounts: { current: 0, previous: 1000 },
        voids: { current: 0, previous: 1500 },
        refunds: { current: 2000, previous: 0 },
      });
    });
  });

  it('item margins use the cost at the time of sale', async () => {
    await withRollback(manager.id, async (q) => {
      const { burger } = await seed(q);
      const out = await range(q, 'report_item_margins');
      // 3 burgers x 150 g x 10 IQD = 4500, though beef now costs 20.
      expect(out.items).toEqual([
        { menu_item_id: burger, name_en: 'Burger', name_ar: 'Burger', qty: 3, revenue: 24000, cost: 4500, margin: 19500, costed: true },
      ]);
      expect(out.totals).toEqual({ revenue: 24000, cost: 4500, margin: 19500 });
    });
  });

  it('a reversed range raises INVALID_RANGE; a waiter is FORBIDDEN', async () => {
    await withRollback(manager.id, async (q) => {
      await expect(range(q, 'analytics_daily_sales', D2, D1)).rejects.toThrow('INVALID_RANGE');
    });
    await withRollback(waiter1.id, async (q) => {
      for (const fn of ['analytics_daily_sales', 'analytics_hourly', 'analytics_by_waiter', 'analytics_payment_mix',
        'panel_headline', 'report_item_margins']) {
        await expect(range(q, fn)).rejects.toThrow('FORBIDDEN');
      }
    });
  });
});
