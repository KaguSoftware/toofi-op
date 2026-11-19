/**
 * Stock admin and stock operations, called as a manager in the caller's
 * transaction: ingredients, suppliers, recipes, deliveries (weighted cost),
 * waste, and the views built on the ledger.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  stackAvailable,
  testIdemKey,
  withRollback,
  type Query,
  type TestStaff,
} from './helpers';
import { call, ingredient, line, menuItem, onHand, recipeLine, seedStock, tab } from './stock-fixtures';

const up = await stackAvailable();

type Row = Record<string, unknown>;

const audits = (q: Query, action: string, entityId: string) =>
  q<{ actor_id: string; reason: string | null }>(
    `select actor_id, reason from audit_log where action = $1 and entity_id = $2`,
    [action, entityId],
  );

describe.skipIf(!up)('stock functions', () => {
  let manager: TestStaff;
  let waiter: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    waiter = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  describe('upsert_ingredient / set_ingredient_active', () => {
    const upsert = (q: Query, id: string | null, unit = 'g', cost = 0) =>
      call<Row>(q, 'upsert_ingredient', [id, 'Flour', 'طحين', unit, 500, cost], [
        'uuid', 'text', 'text', 'stock_unit', 'numeric', 'numeric',
      ]);

    it('creates, then updates, auditing each', async () => {
      await withRollback(manager.id, async (q) => {
        const created = await upsert(q, null);
        expect(created).toMatchObject({ name_en: 'Flour', unit: 'g', reorder_point: 500, is_active: true });
        const id = created.id as string;
        const updated = await upsert(q, id, 'ml', 3.5);
        expect(updated).toMatchObject({ id, unit: 'ml', cost_per_unit: 3.5 });
        expect(await audits(q, 'ingredient.upsert', id)).toHaveLength(2);

        const off = await call<Row>(q, 'set_ingredient_active', [id, false], ['uuid', 'boolean']);
        expect(off).toMatchObject({ id, is_active: false });
        expect(await audits(q, 'ingredient.set_active', id)).toHaveLength(1);
      });
    });

    it('changing the unit after any movement raises UNIT_LOCKED; other edits still work', async () => {
      await withRollback(manager.id, async (q) => {
        const id = (await upsert(q, null)).id as string;
        await seedStock(q, id, 10);
        await expect(upsert(q, id, 'pc')).rejects.toThrow('UNIT_LOCKED');
        await expect(upsert(q, id, 'g', 7)).resolves.toMatchObject({ cost_per_unit: 7 });
      });
    });

    it('an unknown id raises INGREDIENT_NOT_FOUND', async () => {
      await withRollback(manager.id, async (q) => {
        await expect(upsert(q, '00000000-0000-4000-8000-00000000dead')).rejects.toThrow('INGREDIENT_NOT_FOUND');
      });
    });
  });

  it('upsert_supplier creates and updates', async () => {
    await withRollback(manager.id, async (q) => {
      const s = await call<Row>(q, 'upsert_supplier', [null, 'Baghdad Foods', '0770'], ['uuid', 'text', 'text']);
      const again = await call<Row>(q, 'upsert_supplier', [s.id, 'Baghdad Foods Co', null], [
        'uuid', 'text', 'text',
      ]);
      expect(again).toMatchObject({ id: s.id, name: 'Baghdad Foods Co', phone: null });
      expect(await audits(q, 'supplier.upsert', s.id as string)).toHaveLength(2);
    });
  });

  it('set_recipe replaces the recipe lines of an item', async () => {
    await withRollback(manager.id, async (q) => {
      const item = await menuItem(q, 5000);
      const a = await ingredient(q);
      const b = await ingredient(q);
      await call(q, 'set_recipe', [item, JSON.stringify([{ ingredient_id: a, qty: 10 }, { ingredient_id: b, qty: 2 }])], [
        'uuid', 'jsonb',
      ]);
      const out = await call<Row>(q, 'set_recipe', [item, JSON.stringify([{ ingredient_id: b, qty: 3 }])], [
        'uuid', 'jsonb',
      ]);
      expect(out).toEqual({ menu_item_id: item, lines: [{ ingredient_id: b, qty: 3 }] });
      const rows = await q(`select ingredient_id, qty::float8 as qty from recipe_lines where menu_item_id = $1`, [item]);
      expect(rows).toEqual([{ ingredient_id: b, qty: 3 }]);
      expect(await audits(q, 'recipe.set', item)).toHaveLength(2);

      await expect(
        call(q, 'set_recipe', [item, JSON.stringify([{ ingredient_id: a, qty: 0 }])], ['uuid', 'jsonb']),
      ).rejects.toThrow('STOCK_QTY_INVALID');
      await expect(
        call(q, 'set_recipe', ['00000000-0000-4000-8000-00000000dead', '[]'], ['uuid', 'jsonb']),
      ).rejects.toThrow('RECIPE_ITEM_NOT_FOUND');
    });
  });

  describe('receive_delivery', () => {
    const receive = (q: Query, lines: object[], key = testIdemKey('delivery')) =>
      call<Row>(q, 'receive_delivery', [null, JSON.stringify(lines), 'weekly', key], [
        'uuid', 'jsonb', 'text', 'text',
      ]);

    it('adds stock and moves cost_per_unit to the weighted average of on-hand and delivery', async () => {
      await withRollback(manager.id, async (q) => {
        const flour = await ingredient(q, { cost: 2 });
        await seedStock(q, flour, 1000, 2); // 1000 g at 2 = 2000 IQD on hand
        const out = await receive(q, [{ ingredient_id: flour, qty: 500, unit_cost: 5 }]); // + 2500 IQD
        expect(await onHand(q, flour)).toBe(1500);
        const [ing] = await q<{ c: string }>(`select cost_per_unit as c from ingredients where id = $1`, [flour]);
        expect(Number(ing!.c)).toBe(3); // 4500 / 1500
        const [mv] = await q<{ qty: string; unit_cost: string; ref_table: string }>(
          `select m.qty, m.unit_cost, m.ref_table from stock_movements m
             join delivery_lines dl on dl.id = m.ref_id
            where dl.delivery_id = $1`,
          [out.delivery_id],
        );
        expect([Number(mv!.qty), Number(mv!.unit_cost), mv!.ref_table]).toEqual([500, 5, 'delivery_lines']);
        expect(await audits(q, 'delivery.receive', out.delivery_id as string)).toHaveLength(1);
      });
    });

    it('negative on-hand counts as zero: the delivery sets the cost', async () => {
      await withRollback(manager.id, async (q) => {
        const milk = await ingredient(q, { unit: 'ml', cost: 1 });
        await q(`insert into stock_movements (ingredient_id, kind, qty) values ($1, 'waste', -200)`, [milk]);
        await receive(q, [{ ingredient_id: milk, qty: 1000, unit_cost: 4 }]);
        const [ing] = await q<{ c: string }>(`select cost_per_unit as c from ingredients where id = $1`, [milk]);
        expect(Number(ing!.c)).toBe(4);
        expect(await onHand(q, milk)).toBe(800);
      });
    });

    it('a replayed key returns the first result and receives nothing twice', async () => {
      await withRollback(manager.id, async (q) => {
        const sugar = await ingredient(q);
        const key = testIdemKey('delivery');
        const first = await receive(q, [{ ingredient_id: sugar, qty: 100, unit_cost: 1 }], key);
        const second = await receive(q, [{ ingredient_id: sugar, qty: 100, unit_cost: 1 }], key);
        expect(second).toEqual(first);
        expect(await onHand(q, sugar)).toBe(100);
      });
    });

    it('refuses empty or bad lines', async () => {
      await withRollback(manager.id, async (q) => {
        const sugar = await ingredient(q);
        await expect(receive(q, [])).rejects.toThrow('STOCK_LINES_INVALID');
        await expect(receive(q, [{ ingredient_id: sugar, qty: -1, unit_cost: 1 }])).rejects.toThrow(
          'STOCK_QTY_INVALID',
        );
      });
      await withRollback(manager.id, async (q) => {
        const sugar = await ingredient(q);
        await expect(receive(q, [{ ingredient_id: sugar, qty: 1, unit_cost: -1 }])).rejects.toThrow(
          'STOCK_COST_INVALID',
        );
      });
    });
  });

  it('record_waste writes a waste movement at the current cost, audited with its reason', async () => {
    await withRollback(manager.id, async (q) => {
      const fish = await ingredient(q, { cost: 20 });
      await seedStock(q, fish, 1000);
      const out = await call<Row>(q, 'record_waste', [fish, 250, 'spoiled', testIdemKey('waste')], [
        'uuid', 'numeric', 'text', 'text',
      ]);
      expect(await onHand(q, fish)).toBe(750);
      const [mv] = await q<{ kind: string; qty: string; unit_cost: string }>(
        `select kind, qty, unit_cost from stock_movements where id = $1`,
        [out.movement_id],
      );
      expect([mv!.kind, Number(mv!.qty), Number(mv!.unit_cost)]).toEqual(['waste', -250, 20]);
      const [audit] = await audits(q, 'stock.waste', out.movement_id as string);
      expect(audit).toMatchObject({ actor_id: manager.id, reason: 'spoiled' });

      await expect(
        call(q, 'record_waste', [fish, 1, ' ', testIdemKey('waste')], ['uuid', 'numeric', 'text', 'text']),
      ).rejects.toThrow('WASTE_REASON_REQUIRED');
    });
  });

  it('a waiter is refused (FORBIDDEN) before any work', async () => {
    await withRollback(waiter.id, async (q) => {
      const fish = await ingredient(q);
      await expect(
        call(q, 'record_waste', [fish, 1, 'x', testIdemKey('waste')], ['uuid', 'numeric', 'text', 'text']),
      ).rejects.toThrow('FORBIDDEN');
    });
    const { error } = await appRpc(waiter.client, 'start_count');
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  describe('views', () => {
    it('v_ingredient_on_hand and v_low_stock follow the ledger (on-hand <= reorder point)', async () => {
      await withRollback(manager.id, async (q) => {
        const item = await menuItem(q, 3000);
        const beans = await ingredient(q, { cost: 10, reorder: 100 });
        await recipeLine(q, item, beans, 18);
        await seedStock(q, beans, 136);
        const low = () => q(`select ingredient_id from v_low_stock where ingredient_id = $1`, [beans]);

        const [row] = await q<{ on_hand: string; value: string }>(
          `select on_hand, value from v_ingredient_on_hand where ingredient_id = $1`,
          [beans],
        );
        expect([Number(row!.on_hand), Number(row!.value)]).toEqual([136, 1360]);
        expect(await low()).toHaveLength(0);

        const t = await tab(q, manager.id);
        await line(q, t, manager.id, item, 2, 3000); // 136 - 36 = 100: at the reorder point
        expect(await low()).toHaveLength(1);
      });
    });

    it('v_item_cost prices a recipe at the current cost_per_unit', async () => {
      await withRollback(manager.id, async (q) => {
        const item = await menuItem(q, 6000);
        const bare = await menuItem(q, 1000);
        const a = await ingredient(q, { cost: 12.5 });
        const b = await ingredient(q, { unit: 'pc', cost: 250 });
        await recipeLine(q, item, a, 150);
        await recipeLine(q, item, b, 1);
        const rows = await q<{ menu_item_id: string; cost: string; margin: string; has_recipe: boolean }>(
          `select menu_item_id, cost, margin, has_recipe from v_item_cost where menu_item_id in ($1, $2)`,
          [item, bare],
        );
        const byId = Object.fromEntries(rows.map((r) => [r.menu_item_id, [Number(r.cost), Number(r.margin), r.has_recipe]]));
        expect(byId[item]).toEqual([2125, 3875, true]);
        expect(byId[bare]).toEqual([0, 1000, false]);
      });
    });
  });
});
