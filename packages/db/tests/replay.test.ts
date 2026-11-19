/**
 * Idempotency: app.claim_replay(key) and app.finish_replay(key, result), called the
 * way a money function calls them (in the caller's transaction, as the caller).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sqlAs,
  stackAvailable,
  testIdemKey,
  type TestStaff,
} from './helpers';

const up = await stackAvailable();

describe.skipIf(!up)('claim_replay', () => {
  let cashier: TestStaff;
  let waiter: TestStaff;

  beforeAll(async () => {
    cashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  /** One "money function" run: claim, do work only when fresh, finish. */
  const run = (uid: string, key: string, result: object) =>
    sqlAs(uid, async (q) => {
      const [claim] = await q<{ r: unknown }>(`select app.claim_replay($1) as r`, [key]);
      if (claim?.r !== null) return { replayed: true, result: claim?.r };
      const [done] = await q<{ r: unknown }>(`select app.finish_replay($1, $2::jsonb) as r`, [
        key,
        JSON.stringify(result),
      ]);
      return { replayed: false, result: done?.r };
    });

  it('a fresh key returns NULL; a replay returns the stored result, not new work', async () => {
    const key = testIdemKey('settle_tab');
    expect(await run(cashier.id, key, { payment_id: 'p1', due: 0 })).toEqual({
      replayed: false,
      result: { payment_id: 'p1', due: 0 },
    });
    expect(await run(cashier.id, key, { payment_id: 'p2', due: 999 })).toEqual({
      replayed: true,
      result: { payment_id: 'p1', due: 0 },
    });
  });

  it('a claim rolled back with its work leaves the key free', async () => {
    const key = testIdemKey('open_tab');
    await expect(
      sqlAs(cashier.id, async (q) => {
        await q(`select app.claim_replay($1)`, [key]);
        throw new Error('the work failed');
      }),
    ).rejects.toThrow('the work failed');
    expect((await run(cashier.id, key, { ok: true })).replayed).toBe(false);
  });

  it('another caller presenting the key gets IDEMPOTENCY_CONFLICT, never the result', async () => {
    const key = testIdemKey('settle_tab');
    await run(cashier.id, key, { secret: 'mine' });
    await expect(run(waiter.id, key, {})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('a key is required', async () => {
    await expect(run(cashier.id, '', {})).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
    await expect(
      sqlAs(cashier.id, (q) => q(`select app.claim_replay(null)`)),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('claim_replay and finish_replay are internal: no client may call them', async () => {
    const claim = await appRpc(cashier.client, 'claim_replay', { p_key: testIdemKey('x') });
    expect(claim.error?.code).toBe('42501');
    const finish = await appRpc(cashier.client, 'finish_replay', { p_key: 'k', p_result: {} });
    expect(finish.error?.code).toBe('42501');
  });
});
