/**
 * PINs: verify_manager_pin writes a grant that consume_pin_grant spends exactly
 * once; 5 failures in 5 minutes lock the caller out; weak and malformed PINs are
 * refused when set; verify_own_pin checks the caller's own PIN.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sql,
  sqlAs,
  stackAvailable,
  uniquePin,
  type TestStaff,
} from './helpers';
import { addItems, makeMenu, openFreshDay, openTab, type Menu } from './money-fixtures';

const up = await stackAvailable();

const MANAGER_PIN = uniquePin();

/** Spend a grant the way a money function does: in a transaction as the caller. */
function consume(actorId: string, action: string) {
  return sqlAs(actorId, (q) => q<{ a: string }>(`select app.consume_pin_grant($1) as a`, [action]));
}

describe.skipIf(!up)('manager PIN grants', () => {
  let manager: TestStaff;
  let waiter: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', MANAGER_PIN);
    waiter = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('a correct manager PIN answers ok and names the authorizer', async () => {
    const { data, error } = await appRpc(waiter.client, 'verify_manager_pin', {
      p_pin: MANAGER_PIN,
      p_action: 'void_line',
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true, authorized_by: manager.id });
  });

  it('the grant is consumed exactly once, for its own action only', async () => {
    await appRpc(waiter.client, 'verify_manager_pin', { p_pin: MANAGER_PIN, p_action: 'discount' });

    await expect(consume(waiter.id, 'refund')).rejects.toThrow('PIN_GRANT_REQUIRED');
    const [first] = await consume(waiter.id, 'discount');
    expect(first?.a).toBe(manager.id);
    await expect(consume(waiter.id, 'discount')).rejects.toThrow('PIN_GRANT_REQUIRED');
  });

  it('a grant belongs to the caller who typed the PIN', async () => {
    const cashier = await createStaffOfRole('cashier');
    await appRpc(waiter.client, 'verify_manager_pin', { p_pin: MANAGER_PIN, p_action: 'cancel_tab' });
    await expect(consume(cashier.id, 'cancel_tab')).rejects.toThrow('PIN_GRANT_REQUIRED');
    expect((await consume(waiter.id, 'cancel_tab'))[0]?.a).toBe(manager.id);
  });

  it('an expired grant cannot be consumed', async () => {
    await appRpc(waiter.client, 'verify_manager_pin', { p_pin: MANAGER_PIN, p_action: 'expire_me' });
    await sql(
      `update app.pin_grants set expires_at = now() - interval '1 second'
        where actor_id = $1 and action = 'expire_me'`,
      [waiter.id],
    );
    await expect(consume(waiter.id, 'expire_me')).rejects.toThrow('PIN_GRANT_REQUIRED');
  });

  it('consume_pin_grant is internal: no client may call it', async () => {
    const { error } = await appRpc(waiter.client, 'consume_pin_grant', { p_action: 'void_line' });
    expect(error?.code).toBe('42501');
  });

  it('a wrong PIN answers PIN_INVALID, writes no grant, and does not raise', async () => {
    const other = await createStaffOfRole('cashier');
    const { data, error } = await appRpc(other.client, 'verify_manager_pin', {
      p_pin: '000001',
      p_action: 'void_line',
    });
    expect(error).toBeNull();
    expect(data).toEqual({ ok: false, code: 'PIN_INVALID' });
    await expect(consume(other.id, 'void_line')).rejects.toThrow('PIN_GRANT_REQUIRED');
  });

  it('a non-manager PIN never authorizes', async () => {
    const cashierPin = uniquePin();
    const cashier = await createStaffOfRole('cashier', cashierPin);
    const { data } = await appRpc(waiter.client, 'verify_manager_pin', {
      p_pin: cashierPin,
      p_action: 'void_line',
    });
    expect(data).toEqual({ ok: false, code: 'PIN_INVALID' });
    expect(cashier.role).toBe('cashier');
  });

  it('an action name is required', async () => {
    const { error } = await appRpc(waiter.client, 'verify_manager_pin', { p_pin: MANAGER_PIN, p_action: '' });
    expect(error?.message).toBe('PIN_ACTION_REQUIRED');
  });
});

describe.skipIf(!up)('PIN lockout', () => {
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('5 failures in 5 minutes lock the caller out, even for a correct PIN', async () => {
    const pin = uniquePin();
    await createStaffOfRole('owner', pin);
    const cashier = await createStaffOfRole('cashier');
    const answers: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const { data, error } = await appRpc(cashier.client, 'verify_manager_pin', {
        p_pin: '000002',
        p_action: 'refund',
      });
      expect(error).toBeNull();
      answers.push(data);
    }
    expect(answers.slice(0, 4)).toEqual(Array(4).fill({ ok: false, code: 'PIN_INVALID' }));
    expect(answers[4]).toEqual({ ok: false, code: 'PIN_LOCKED' });

    const correct = await appRpc(cashier.client, 'verify_manager_pin', { p_pin: pin, p_action: 'refund' });
    expect(correct.data).toEqual({ ok: false, code: 'PIN_LOCKED' });
    await expect(consume(cashier.id, 'refund')).rejects.toThrow('PIN_GRANT_REQUIRED');

    // The lockout is audited once, on the failure that reached the threshold.
    const audits = await sql(`select 1 from audit_log where action = 'staff.pin_locked' and entity_id = $1`, [
      cashier.id,
    ]);
    expect(audits).toHaveLength(1);
  });

  it('the lock lifts when the failures age out of the 5-minute window', async () => {
    const pin = uniquePin();
    const owner = await createStaffOfRole('owner', pin);
    const waiter = await createStaffOfRole('waiter');
    for (let i = 0; i < 5; i++) {
      await appRpc(waiter.client, 'verify_manager_pin', { p_pin: '000003', p_action: 'void_line' });
    }
    await sql(`update app.pin_attempts set at = at - interval '6 minutes' where actor_id = $1`, [waiter.id]);
    const { data } = await appRpc(waiter.client, 'verify_manager_pin', { p_pin: pin, p_action: 'void_line' });
    expect(data).toEqual({ ok: true, authorized_by: owner.id });
  });

  it('the lockout is shared with verify_own_pin', async () => {
    const waiter = await createStaffOfRole('waiter', '730461');
    for (let i = 0; i < 5; i++) {
      await appRpc(waiter.client, 'verify_own_pin', { p_pin: '000004' });
    }
    const { data } = await appRpc(waiter.client, 'verify_own_pin', { p_pin: '730461' });
    expect(data).toEqual({ ok: false, code: 'PIN_LOCKED' });
    const mgr = await appRpc(waiter.client, 'verify_manager_pin', { p_pin: '000005', p_action: 'x' });
    expect(mgr.data).toEqual({ ok: false, code: 'PIN_LOCKED' });
  });
});

describe.skipIf(!up)('own PIN', () => {
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('set_own_pin refuses malformed and weak PINs', async () => {
    const waiter = await createStaffOfRole('waiter');
    for (const pin of ['12345', '1234567890123', '12a456', '']) {
      const { error } = await appRpc(waiter.client, 'set_own_pin', { p_pin: pin });
      expect(error?.message, pin).toBe('PIN_FORMAT');
    }
    for (const pin of ['111111', '123456', '654321', '567890', '3456789']) {
      const { error } = await appRpc(waiter.client, 'set_own_pin', { p_pin: pin });
      expect(error?.message, pin).toBe('PIN_WEAK');
    }
  });

  it('verify_own_pin checks the caller’s own PIN', async () => {
    const waiter = await createStaffOfRole('waiter');
    expect((await appRpc(waiter.client, 'verify_own_pin', { p_pin: '840271' })).data).toEqual({
      ok: false,
      code: 'PIN_NOT_SET',
    });
    expect((await appRpc(waiter.client, 'set_own_pin', { p_pin: '840271' })).error).toBeNull();
    expect((await appRpc(waiter.client, 'verify_own_pin', { p_pin: '840271' })).data).toEqual({ ok: true });
    expect((await appRpc(waiter.client, 'verify_own_pin', { p_pin: '840272' })).data).toEqual({
      ok: false,
      code: 'PIN_INVALID',
    });
  });

  it('setting a PIN is audited without the PIN, and the hash is never readable by staff', async () => {
    const manager = await createStaffOfRole('manager', '905318');
    const audits = await sql<{ after: unknown }>(
      `select after from audit_log where action = 'staff.pin_set' and entity_id = $1`,
      [manager.id],
    );
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain('905318');

    const { error } = await manager.client.from('staff').select('pin_hash').eq('id', manager.id);
    expect(error?.code).toBe('42501');
  });
});

describe.skipIf(!up)('PIN lockout under parallel requests', () => {
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const failures = async (actor: string) =>
    Number(
      (await sql<{ n: string }>(`select count(*) n from app.pin_attempts where actor_id = $1 and not ok`, [actor]))[0]!
        .n,
    );

  it('12 parallel wrong manager PINs record exactly 5 failures, then answer PIN_LOCKED', async () => {
    await createStaffOfRole('manager', uniquePin());
    const cashier = await createStaffOfRole('cashier');
    const answers = await Promise.all(
      Array.from({ length: 12 }, () =>
        appRpc(cashier.client, 'verify_manager_pin', { p_pin: '000006', p_action: 'refund' }),
      ),
    );
    expect(answers.every((a) => a.error === null)).toBe(true);
    expect(await failures(cashier.id)).toBe(5);
    const codes = answers.map((a) => (a.data as { code: string }).code);
    expect(codes.filter((c) => c === 'PIN_INVALID')).toHaveLength(4);
    expect(codes.filter((c) => c === 'PIN_LOCKED')).toHaveLength(8);
  });

  it('12 parallel wrong own PINs record exactly 5 failures', async () => {
    const waiter = await createStaffOfRole('waiter', uniquePin());
    await Promise.all(Array.from({ length: 12 }, () => appRpc(waiter.client, 'verify_own_pin', { p_pin: '000007' })));
    expect(await failures(waiter.id)).toBe(5);
  });
});

describe.skipIf(!up)('PIN grants in the real gated functions', () => {
  const PIN = uniquePin();
  let waiter: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    const manager = await createStaffOfRole('manager', PIN);
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    await openFreshDay(manager);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const voidLine = (line: string) => appRpc(waiter.client, 'void_item', { p_order_item_id: line, p_reason: 'x' });
  const verify = (action: string, entity?: string) =>
    appRpc(waiter.client, 'verify_manager_pin', {
      p_pin: PIN,
      p_action: action,
      ...(entity ? { p_entity_id: entity } : {}),
    });

  it("void_item spends a 'void_item' grant, and only that action's", async () => {
    const tab = await openTab(waiter);
    const [a, b] = await addItems(waiter, tab, [
      { menu_item_id: menu.tea, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    expect((await verify('void_line')).data).toMatchObject({ ok: true });
    expect((await voidLine(a!)).error?.message).toBe('PIN_GRANT_REQUIRED');
    expect((await verify('void_item')).data).toMatchObject({ ok: true });
    expect((await voidLine(a!)).error).toBeNull();
    expect((await voidLine(b!)).error?.message).toBe('PIN_GRANT_REQUIRED');
  });

  it('a grant bound to one line cannot void another; an unbound grant voids any', async () => {
    const tab = await openTab(waiter);
    const [a, b, c] = await addItems(waiter, tab, [
      { menu_item_id: menu.tea, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    expect((await verify('void_item', a)).data).toMatchObject({ ok: true });
    expect((await voidLine(b!)).error?.message).toBe('PIN_GRANT_REQUIRED');
    expect((await voidLine(a!)).error).toBeNull();
    expect((await verify('void_item')).data).toMatchObject({ ok: true });
    expect((await voidLine(c!)).error).toBeNull();
  });

  it('a bound grant is spent before an unbound one for its own entity', async () => {
    const tab = await openTab(waiter);
    const [a, b] = await addItems(waiter, tab, [
      { menu_item_id: menu.tea, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    // The bound grant is older: newest-first alone would spend the unbound one on a.
    await verify('void_item', a);
    await verify('void_item');
    expect((await voidLine(a!)).error).toBeNull();
    expect((await voidLine(b!)).error).toBeNull();
  });
});
