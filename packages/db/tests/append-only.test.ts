/**
 * payments, refunds, stock_movements and audit_log are append-only: the
 * forbid_mutation trigger refuses UPDATE and DELETE even for the table owner, and
 * no API role holds the privilege in the first place.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupStaff,
  createStaffOfRole,
  endDb,
  serviceClient,
  stackAvailable,
  withRollback,
  type Query,
  type TestStaff,
} from './helpers';

const up = await stackAvailable();

const LEDGERS = ['payments', 'refunds', 'stock_movements', 'audit_log'] as const;

/** One row in each ledger, inside the caller's (rolled-back) transaction. */
async function plantLedgerRows(q: Query, staffId: string): Promise<void> {
  const [day] = await q<{ id: string }>(
    `insert into day_sessions (business_date, opened_by, closed_by, closed_at)
     values (date '1999-01-01', $1, $1, now()) returning id`,
    [staffId],
  );
  const [tab] = await q<{ id: string }>(
    `insert into tabs (day_session_id, waiter_id, idempotency_key)
     values ($1, $2, gen_random_uuid()::text) returning id`,
    [day?.id, staffId],
  );
  const [payment] = await q<{ id: string }>(
    `insert into payments (tab_id, method, amount, taken_by, idempotency_key)
     values ($1, 'card', 5000, $2, gen_random_uuid()::text) returning id`,
    [tab?.id, staffId],
  );
  await q(
    `insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by)
     values ($1, $2, 1000, 'card', 'test', $3)`,
    [payment?.id, tab?.id, staffId],
  );
  const [ingredient] = await q<{ id: string }>(
    `insert into ingredients (name_en, name_ar, unit) values ('Flour', 'طحين', 'g') returning id`,
  );
  await q(`insert into stock_movements (ingredient_id, kind, qty) values ($1, 'delivery', 1000)`, [
    ingredient?.id,
  ]);
  await q(`select app.write_audit('test.row', 'tabs', $1::uuid)`, [tab?.id]);
}

describe.skipIf(!up)('append-only ledgers', () => {
  let manager: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  for (const table of LEDGERS) {
    it(`${table}: UPDATE raises APPEND_ONLY, even for the table owner`, async () => {
      await withRollback(manager.id, async (q) => {
        await plantLedgerRows(q, manager.id);
        await expect(q(`update ${table} set created_at = now()`)).rejects.toThrow('APPEND_ONLY');
      });
    });

    it(`${table}: DELETE raises APPEND_ONLY, even for the table owner`, async () => {
      await withRollback(manager.id, async (q) => {
        await plantLedgerRows(q, manager.id);
        await expect(q(`delete from ${table}`)).rejects.toThrow('APPEND_ONLY');
      });
    });

    it(`${table}: the service role holds no UPDATE or DELETE privilege`, async () => {
      const svc = serviceClient();
      const upd = await svc.from(table).update({ created_at: new Date().toISOString() }).eq('id', crypto.randomUUID());
      expect(upd.error?.code).toBe('42501');
      const del = await svc.from(table).delete().eq('id', crypto.randomUUID());
      expect(del.error?.code).toBe('42501');
    });
  }

  it('an insert still works (append is allowed)', async () => {
    await withRollback(manager.id, async (q) => {
      await plantLedgerRows(q, manager.id);
      const rows = await q<{ n: number }>(`select count(*)::int as n from payments where amount = 5000`);
      expect(rows[0]?.n).toBeGreaterThanOrEqual(1);
    });
  });
});
