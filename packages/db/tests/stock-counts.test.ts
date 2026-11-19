/**
 * Blind stock counts: one open count at a time, the count screen never sees
 * on-hand, and finalizing applies counted - (on-hand when that line was saved),
 * so sales made between counting and finalizing are kept.
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
import { call, ingredient, line, menuItem, onHand, recipeLine, seedStock, tab } from './stock-fixtures';

const up = await stackAvailable();

type Row = Record<string, unknown>;

/** Close any count left open by an earlier run or the role matrix, inside this transaction. */
const closeOpenCounts = (q: Query) =>
  q(`update stock_counts set finalized_at = now(), finalized_by = started_by where finalized_at is null`);

const save = (q: Query, countId: string, lines: object[]) =>
  call<Row>(q, 'save_count_lines', [countId, JSON.stringify(lines)], ['uuid', 'jsonb']);

describe.skipIf(!up)('stock counts', () => {
  let manager: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('only one count may be open at a time', async () => {
    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      await call(q, 'start_count');
      await expect(call(q, 'start_count')).rejects.toThrow('COUNT_ALREADY_OPEN');
    });
  });

  it('a count adjusts by counted - on-hand at save, so sales between counting and finalizing are kept', async () => {
    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      const item = await menuItem(q, 4000);
      const rice = await ingredient(q, { cost: 3 });
      const oil = await ingredient(q, { unit: 'ml' });
      await recipeLine(q, item, rice, 100);
      await seedStock(q, rice, 1000);
      await seedStock(q, oil, 500);

      const started = await call<Row>(q, 'start_count');
      expect(started).toEqual({ count_id: expect.any(String) });
      const countId = started.count_id as string;
      const [snap] = await q<{ expected: string }>(
        `select expected from stock_count_lines where count_id = $1 and ingredient_id = $2`,
        [countId, rice],
      );
      expect(Number(snap!.expected)).toBe(1000);

      // Blind: saving answers what was saved, never the expected quantity.
      const saved = await save(q, countId, [{ ingredient_id: rice, counted: 850 }]);
      expect(saved).toEqual({ count_id: countId, saved: 1 });
      expect(JSON.stringify(saved)).not.toMatch(/expected|on_hand/);

      // Counted 850 against 1000 on hand: 150 short. A sale then lands before
      // finalize (on-hand 1000 -> 900); it is real and must survive the count.
      const t = await tab(q, manager.id);
      await line(q, t, manager.id, item, 1, 4000);
      expect(await onHand(q, rice)).toBe(900);

      const fin = await call<Row>(q, 'finalize_count', [countId], ['uuid']);
      expect(fin).toEqual({ count_id: countId, adjustments: [{ ingredient_id: rice, qty: -150 }] });
      expect(await onHand(q, rice)).toBe(750); // counted 850, less the 100 sold after counting
      expect(await onHand(q, oil)).toBe(500); // not counted: untouched

      const [mv] = await q<{ kind: string; unit_cost: string; ref_table: string }>(
        `select kind, unit_cost, ref_table from stock_movements where ingredient_id = $1 and kind = 'count_adjust'`,
        [rice],
      );
      expect([mv!.kind, Number(mv!.unit_cost), mv!.ref_table]).toEqual(['count_adjust', 3, 'stock_count_lines']);
      const audit = await q(`select 1 from audit_log where action = 'count.finalize' and entity_id = $1`, [countId]);
      expect(audit).toHaveLength(1);

      await expect(call(q, 'finalize_count', [countId], ['uuid'])).rejects.toThrow('COUNT_NOT_OPEN');
      await expect(save(q, countId, [{ ingredient_id: rice, counted: 1 }])).rejects.toThrow('COUNT_NOT_OPEN');
      // Closed: a new count may start.
      await expect(call(q, 'start_count')).resolves.toBeTruthy();
    });
  });

  it('counting matching on-hand writes no movement; a count can be corrected before finalizing', async () => {
    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      const salt = await ingredient(q);
      await seedStock(q, salt, 40);
      const countId = (await call<Row>(q, 'start_count')).count_id as string;
      await save(q, countId, [{ ingredient_id: salt, counted: 10 }]);
      await save(q, countId, [{ ingredient_id: salt, counted: 40 }]);
      const fin = await call<Row>(q, 'finalize_count', [countId], ['uuid']);
      expect(fin).toEqual({ count_id: countId, adjustments: [] });
      expect(await onHand(q, salt)).toBe(40);
      await expect(save(q, countId, [{ ingredient_id: salt, counted: -1 }])).rejects.toThrow();
    });
  });

  it('50 counted, 5 sold before finalize: on-hand ends at 45; a re-save takes a fresh snapshot', async () => {
    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      const item = await menuItem(q, 1000);
      const buns = await ingredient(q, { unit: 'pc' });
      const eggs = await ingredient(q, { unit: 'pc' });
      await recipeLine(q, item, buns, 1);
      await recipeLine(q, item, eggs, 1);
      await seedStock(q, buns, 60);
      await seedStock(q, eggs, 30);
      const countId = (await call<Row>(q, 'start_count')).count_id as string;

      // 10:00 both counted. 10:30 five sold.
      await save(q, countId, [
        { ingredient_id: buns, counted: 50 },
        { ingredient_id: eggs, counted: 30 },
      ]);
      const t = await tab(q, manager.id);
      await line(q, t, manager.id, item, 5, 5000);
      // Eggs recounted after the sale: 25 against 25 on hand now, no adjustment.
      await save(q, countId, [{ ingredient_id: eggs, counted: 25 }]);

      // 11:00 finalize.
      const fin = await call<Row>(q, 'finalize_count', [countId], ['uuid']);
      expect(fin).toEqual({ count_id: countId, adjustments: [{ ingredient_id: buns, qty: -10 }] });
      expect(await onHand(q, buns)).toBe(45);
      expect(await onHand(q, eggs)).toBe(25);
    });
  });

  it('the at-save snapshot is not readable by clients', async () => {
    const snap = await manager.client.from('stock_count_lines').select('on_hand_at_save').limit(1);
    expect(snap.error?.code).toBe('42501');
  });

  it('an unknown count raises COUNT_NOT_FOUND; a negative count STOCK_QTY_INVALID', async () => {
    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      await expect(call(q, 'finalize_count', ['00000000-0000-4000-8000-00000000dead'], ['uuid'])).rejects.toThrow(
        'COUNT_NOT_FOUND',
      );
      const salt = await ingredient(q);
      const countId = (await call<Row>(q, 'start_count')).count_id as string;
      await expect(save(q, countId, [{ ingredient_id: salt, counted: -1 }])).rejects.toThrow('STOCK_QTY_INVALID');
    });
  });

  it('expected is never readable through the table; the manager report shows it only after finalize', async () => {
    const select = await manager.client.from('stock_count_lines').select('expected').limit(1);
    expect(select.error?.code).toBe('42501');
    const star = await manager.client.from('stock_count_lines').select('*').limit(1);
    expect(star.error?.code).toBe('42501');
    const allowed = await manager.client.from('stock_count_lines').select('id, count_id, ingredient_id, counted').limit(1);
    expect(allowed.error).toBeNull();

    await withRollback(manager.id, async (q) => {
      await closeOpenCounts(q);
      const flour = await ingredient(q);
      await seedStock(q, flour, 70);
      const countId = (await call<Row>(q, 'start_count')).count_id as string;
      await save(q, countId, [{ ingredient_id: flour, counted: 60 }]);
      await expect(call(q, 'stock_count_report', [countId], ['uuid'])).rejects.toThrow('COUNT_NOT_FINALIZED');
      await call(q, 'finalize_count', [countId], ['uuid']);
      const report = await call<Row>(q, 'stock_count_report', [countId], ['uuid']);
      expect(report).toMatchObject({ count_id: countId, finalized_at: expect.any(String) });
      const lines = report.lines as Row[];
      expect(lines.find((l) => l.ingredient_id === flour)).toEqual({
        ingredient_id: flour,
        expected: 70,
        counted: 60,
        variance: -10,
      });
      await expect(
        call(q, 'stock_count_report', ['00000000-0000-4000-8000-00000000dead'], ['uuid']),
      ).rejects.toThrow('COUNT_NOT_FOUND');
    });
  });
});
