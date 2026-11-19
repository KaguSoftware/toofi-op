/**
 * Broadcast refetch signals: writes to the service tables signal on tabs:<venue>,
 * stock movements on stock:<venue>, the payload is only {table, id}, and a
 * broken realtime never fails the write.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  VENUE_ID,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  stackAvailable,
  withRollback,
  type Query,
  type TestStaff,
} from './helpers';
import { ingredient, line, menuItem, payment, recipeLine, refund, seedStock, tab } from './stock-fixtures';

const up = await stackAvailable();

const signals = (q: Query, topic: string) =>
  q<{ event: string; payload: { table: string; id: string } }>(
    `select event, payload from realtime.messages where topic = $1 order by inserted_at, id`,
    [topic],
  );

describe.skipIf(!up)('realtime signals', () => {
  let waiter: TestStaff;

  beforeAll(async () => {
    waiter = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('service writes signal tabs:<venue>; stock movements signal stock:<venue>, payload {table, id} only', async () => {
    await withRollback(waiter.id, async (q) => {
      const item = await menuItem(q, 2000);
      const ing = await ingredient(q);
      await recipeLine(q, item, ing, 1);
      const t = await tab(q, waiter.id);
      const l = await line(q, t, waiter.id, item, 1, 2000);
      const p = await payment(q, t, waiter.id, 2000);
      await refund(q, p, t, waiter.id, 500);

      const tabSignals = (await signals(q, `tabs:${VENUE_ID}`)).map((s) => s.payload);
      expect(tabSignals).toContainEqual({ table: 'tabs', id: t });
      expect(tabSignals).toContainEqual({ table: 'order_items', id: l });
      expect(tabSignals).toContainEqual({ table: 'payments', id: p });
      expect(tabSignals.map((s) => s.table)).toEqual(
        expect.arrayContaining(['tabs', 'orders', 'order_items', 'payments', 'refunds']),
      );
      for (const s of tabSignals) expect(Object.keys(s).sort()).toEqual(['id', 'table']);

      const [move] = await q<{ id: string }>(`select id from stock_movements where ref_id = $1`, [l]);
      const stock = (await signals(q, `stock:${VENUE_ID}`)).filter((s) => s.payload.id === move!.id);
      expect(stock).toEqual([{ event: 'changed', payload: { table: 'stock_movements', id: move!.id } }]);
    });
  });

  it('a failing broadcast never fails the write', async () => {
    // Another session holds realtime.messages exclusively, so every send in the
    // writer's transaction hits its lock timeout: a real broadcast failure.
    await withRollback(null, async (blocker) => {
      await blocker(`lock table realtime.messages in access exclusive mode`);
      await withRollback(waiter.id, async (q) => {
        await q(`set local lock_timeout = '100ms'`);
        const t = await tab(q, waiter.id);
        const ing = await ingredient(q);
        await seedStock(q, ing, 5);
        expect(await q(`select 1 from tabs where id = $1`, [t])).toHaveLength(1);
        expect(await q(`select 1 from stock_movements where ingredient_id = $1`, [ing])).toHaveLength(1);
      });
    });
  });
});
