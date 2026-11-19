/**
 * app.compute_tab_totals and the percent discount against @rop/core's money/__fixtures__/tab-totals-cases.json,
 * the numeric cases a TypeScript mirror of the totals must also pass. Each case
 * builds its tab inside a rolled-back transaction, as a manager.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupStaff, createStaffOfRole, endDb, stackAvailable, withRollback, type Query, type TestStaff } from './helpers';
import { makeMenu, openFreshDay } from './money-fixtures';
import cases from '../../core/src/money/__fixtures__/tab-totals-cases.json';

const up = await stackAvailable();

interface Line {
  id: string;
  line_total: number;
  tax_rate_bps: number;
  voided: boolean;
}

describe.skipIf(!up)('compute_tab_totals cases', () => {
  let manager: TestStaff;
  let dayId: string;
  let menuItem: string;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    dayId = await openFreshDay(manager);
    menuItem = (await makeMenu()).tea;
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  /** A tab with these lines, discounts, payments and refunds; returns its id. */
  async function buildTab(
    q: Query,
    c: {
      lines: Line[];
      discounts: number[];
      percent_discounts?: { bps: number; stored_amount: number }[];
      payments: number[];
      refunds: number[];
    },
  ) {
    const key = () => `TEST:fixture:${Math.random()}`;
    const [tab] = await q<{ id: string }>(
      `insert into tabs (day_session_id, waiter_id, idempotency_key) values ($1, $2, $3) returning id`,
      [dayId, manager.id, key()],
    );
    const [order] = await q<{ id: string }>(
      `insert into orders (tab_id, placed_by, idempotency_key) values ($1, $2, $3) returning id`,
      [tab!.id, manager.id, key()],
    );
    for (const l of c.lines) {
      await q(
        `insert into order_items (id, order_id, tab_id, menu_item_id, name_en, name_ar, unit_price, qty,
                                  line_total, tax_rate_bps, voided_at, voided_by, void_reason)
         values ($1, $2, $3, $4, 'x', 'x', $5, 1, $5, $6,
                 case when $7 then now() end, case when $7 then $8::uuid end, case when $7 then 'test' end)`,
        [l.id, order!.id, tab!.id, menuItem, l.line_total, l.tax_rate_bps, l.voided, manager.id],
      );
    }
    for (const d of c.discounts) {
      await q(
        `insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by)
         values ($1, 'discount_amount', $2::bigint, $2::bigint, 'test', $3)`,
        [tab!.id, d, manager.id],
      );
    }
    for (const p of c.percent_discounts ?? []) {
      await q(
        `insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by)
         values ($1, 'discount_percent', $2, $3, 'test', $4)`,
        [tab!.id, p.bps, p.stored_amount, manager.id],
      );
    }
    const paymentIds: string[] = [];
    for (const p of c.payments) {
      const [row] = await q<{ id: string }>(
        `insert into payments (tab_id, method, amount, taken_by, idempotency_key)
         values ($1, 'card', $2, $3, $4) returning id`,
        [tab!.id, p, manager.id, key()],
      );
      paymentIds.push(row!.id);
    }
    for (const r of c.refunds) {
      await q(
        `insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by)
         values ($1, $2, $3, 'card', 'test', $4)`,
        [paymentIds[0], tab!.id, r, manager.id],
      );
    }
    return tab!.id;
  }

  for (const c of cases.cases) {
    it(c.name, async () => {
      const got = await withRollback(manager.id, async (q) => {
        const tabId = await buildTab(q, c);
        const [row] = await q<{ t: unknown }>(`select app.compute_tab_totals($1) as t`, [tabId]);
        return row!.t;
      });
      expect(got).toEqual(c.expected);
    });
  }

  for (const c of cases.percent_cases) {
    it(`percent discount: ${c.name}`, async () => {
      const got = await withRollback(manager.id, async (q) => {
        const tabId = await buildTab(q, {
          lines: [{ id: '00000000-0000-4000-8000-000000000001', line_total: c.subtotal, tax_rate_bps: 0, voided: false }],
          discounts: c.existing_discount ? [c.existing_discount] : [],
          payments: [],
          refunds: [],
        });
        const [row] = await q<{ r: { amount: number } }>(
          `select app.apply_discount($1, 'discount_percent', $2, 'test', $3) as r`,
          [tabId, c.bps, `TEST:discount:${Math.random()}`],
        );
        return row!.r.amount;
      });
      expect(got).toBe(c.expected_amount);
    });
  }
});
