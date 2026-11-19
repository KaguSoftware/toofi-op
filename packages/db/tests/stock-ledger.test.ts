/**
 * The stock ledger follows the service: a sent line deducts its recipe, a voided
 * line returns it, and a sale is never blocked by stock (on-hand may go negative).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupStaff,
  createStaffOfRole,
  endDb,
  stackAvailable,
  withRollback,
  type TestStaff,
} from './helpers';
import { ingredient, line, menuItem, onHand, recipeLine, seedStock, tab, voidLine } from './stock-fixtures';

const up = await stackAvailable();

describe.skipIf(!up)('stock ledger triggers', () => {
  let waiter: TestStaff;
  let manager: TestStaff;

  beforeAll(async () => {
    waiter = await createStaffOfRole('waiter');
    manager = await createStaffOfRole('manager');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('a sale deducts recipe qty x line qty, at the current cost, referencing the line', async () => {
    await withRollback(waiter.id, async (q) => {
      const burger = await menuItem(q, 8000);
      const bun = await ingredient(q, { unit: 'pc', cost: 250 });
      const beef = await ingredient(q, { unit: 'g', cost: 12.5 });
      await recipeLine(q, burger, bun, 1);
      await recipeLine(q, burger, beef, 150);
      await seedStock(q, bun, 10);
      await seedStock(q, beef, 1000);

      const t = await tab(q, waiter.id);
      const l = await line(q, t, waiter.id, burger, 3, 8000);

      expect(await onHand(q, bun)).toBe(7);
      expect(await onHand(q, beef)).toBe(550);
      const moves = await q<{ kind: string; qty: string; unit_cost: string; ref_table: string; actor_id: string }>(
        `select kind, qty, unit_cost, ref_table, actor_id from stock_movements
          where ref_id = $1 order by qty`,
        [l],
      );
      expect(moves.map((m) => [m.kind, Number(m.qty), Number(m.unit_cost), m.ref_table, m.actor_id])).toEqual([
        ['sale', -450, 12.5, 'order_items', waiter.id],
        ['sale', -3, 250, 'order_items', waiter.id],
      ]);
    });
  });

  it('an item without a recipe moves no stock', async () => {
    await withRollback(waiter.id, async (q) => {
      const water = await menuItem(q, 1000);
      const t = await tab(q, waiter.id);
      const l = await line(q, t, waiter.id, water, 2, 1000);
      const moves = await q(`select 1 from stock_movements where ref_id = $1`, [l]);
      expect(moves).toHaveLength(0);
    });
  });

  it('a sale is never blocked: on-hand goes negative', async () => {
    await withRollback(waiter.id, async (q) => {
      const tea = await menuItem(q, 1500);
      const leaves = await ingredient(q, { unit: 'g' });
      await recipeLine(q, tea, leaves, 5);
      await seedStock(q, leaves, 4);
      const t = await tab(q, waiter.id);
      await line(q, t, waiter.id, tea, 2, 1500);
      expect(await onHand(q, leaves)).toBe(-6);
    });
  });

  it('voiding a line returns exactly what its sale took, even after the recipe or cost changed', async () => {
    await withRollback(waiter.id, async (q) => {
      const burger = await menuItem(q, 8000);
      const beef = await ingredient(q, { unit: 'g', cost: 10 });
      await recipeLine(q, burger, beef, 150);
      await seedStock(q, beef, 1000);
      const t = await tab(q, waiter.id);
      const l = await line(q, t, waiter.id, burger, 2, 8000);
      expect(await onHand(q, beef)).toBe(700);

      await q(`update recipe_lines set qty = 999 where menu_item_id = $1`, [burger]);
      await q(`update ingredients set cost_per_unit = 99 where id = $1`, [beef]);
      await voidLine(q, l, manager.id);

      expect(await onHand(q, beef)).toBe(1000);
      const [ret] = await q<{ qty: string; unit_cost: string }>(
        `select qty, unit_cost from stock_movements where ref_id = $1 and kind = 'void_return'`,
        [l],
      );
      expect([Number(ret!.qty), Number(ret!.unit_cost)]).toEqual([300, 10]);

      // A later unrelated update of the voided line does not return stock twice.
      await q(`update order_items set note = 'x' where id = $1`, [l]);
      expect(await onHand(q, beef)).toBe(1000);
    });
  });
});
