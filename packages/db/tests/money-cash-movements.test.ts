/**
 * Cash movements: cash that enters or leaves the drawer without a sale (paid-out,
 * pay-in, drop). They are an append-only ledger on the till shift, a cashier needs a
 * manager PIN bound to the shift and the amount, and the shift's expected cash and the
 * day summary count them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sql,
  stackAvailable,
  testIdemKey,
  uniquePin,
  type TestStaff,
} from './helpers';
import { addItems, makeMenu, openFreshDay, openTab, type Menu } from './money-fixtures';

const up = await stackAvailable();
const PIN = uniquePin();
const rnd = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!up)('cash movements', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let otherCashier: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;
  let dayId: string;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', PIN);
    cashier = await createStaffOfRole('cashier');
    otherCashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    dayId = await openFreshDay(manager);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const openShift = async (staff: TestStaff, float = 50000): Promise<string> => {
    const { data, error } = await appRpc(staff.client, 'open_till_shift', { p_device_id: `till-${rnd()}`, p_opening_float: float });
    if (error) throw new Error(`open_till_shift failed: ${error.message}`);
    return (data as { shift_id: string }).shift_id;
  };
  const closeShift = (staff: TestStaff, counted: number) => appRpc(staff.client, 'close_till_shift', { p_counted_cash: counted });
  const move = (staff: TestStaff, kind: string, amount: number, reason = 'gas bottle', key = testIdemKey('cash')) =>
    appRpc(staff.client, 'record_cash_movement', { p_kind: kind, p_amount: amount, p_reason: reason, p_idempotency_key: key });
  const grant = async (actor: TestStaff, shiftId: string | null, amount: number | null) => {
    const { data, error } = await appRpc(actor.client, 'verify_manager_pin', {
      p_pin: PIN,
      p_action: 'cash_movement',
      p_entity_id: shiftId,
      p_value: amount,
    });
    if (error || !(data as { ok: boolean }).ok) throw new Error(`verify_manager_pin failed: ${JSON.stringify(data)}`);
  };

  it('a cashier needs a manager PIN bound to the shift and the amount', async () => {
    const shiftId = await openShift(cashier);
    expect((await move(cashier, 'paid_out', 20000)).error?.message).toBe('PIN_GRANT_REQUIRED');

    // A grant for another amount does not authorize this one.
    await grant(cashier, shiftId, 5000);
    expect((await move(cashier, 'paid_out', 20000)).error?.message).toBe('PIN_GRANT_REQUIRED');

    await grant(cashier, shiftId, 20000);
    const done = await move(cashier, 'paid_out', 20000, '  supplier: bread  ');
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({ till_shift_id: shiftId, kind: 'paid_out', amount: 20000 });
    expect(done.data).not.toHaveProperty('expected_cash'); // the count stays blind

    const id = (done.data as { movement_id: string }).movement_id;
    expect(
      await sql(
        `select kind::text, amount::int, reason, staff_id, authorized_by, day_session_id from cash_movements where id = $1`,
        [id],
      ),
    ).toEqual([
      { kind: 'paid_out', amount: 20000, reason: 'supplier: bread', staff_id: cashier.id, authorized_by: manager.id, day_session_id: dayId },
    ]);
    expect(
      await sql(`select actor_id, authorized_by from audit_log where action = 'cash_movement.paid_out' and entity_id = $1`, [id]),
    ).toEqual([{ actor_id: cashier.id, authorized_by: manager.id }]);

    // The grant was spent: a second movement needs a new one.
    expect((await move(cashier, 'paid_out', 20000)).error?.message).toBe('PIN_GRANT_REQUIRED');
    expect((await closeShift(cashier, 30000)).error).toBeNull();
  });

  it('expected cash counts pay-ins, paid-outs and drops', async () => {
    const opened = await appRpc(manager.client, 'open_till_shift', { p_device_id: `till-${rnd()}`, p_opening_float: 50000 });
    expect(opened.error).toBeNull();
    const { shift_id: shiftId, device_id: device } = opened.data as { shift_id: string; device_id: string };

    // burger + tea = 13,500, of which 12,150 in cash on this shift.
    const tab = await openTab(waiter);
    await addItems(waiter, tab, [
      { menu_item_id: menu.burger, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    for (const [method, amount, tendered] of [['cash', 12150, 20000], ['card', 1350, null]] as const) {
      const paid = await appRpc(manager.client, 'settle_tab', {
        p_tab_id: tab,
        p_method: method,
        p_amount: amount,
        p_tendered: tendered,
        p_device_id: device,
        p_idempotency_key: testIdemKey('pay'),
      });
      expect(paid.error).toBeNull();
    }

    // A manager is their own authorizer: no PIN.
    expect((await move(manager, 'pay_in', 5000, 'change from the bank')).error).toBeNull();
    expect((await move(manager, 'paid_out', 20000, 'vegetables')).error).toBeNull();
    expect((await move(manager, 'drop', 30000, 'to the safe')).error).toBeNull();
    expect(await sql(`select distinct authorized_by from cash_movements where till_shift_id = $1`, [shiftId])).toEqual([
      { authorized_by: manager.id },
    ]);

    // 50,000 float + 12,150 cash + 5,000 in - 20,000 out - 30,000 dropped = 17,150.
    const closed = await closeShift(manager, 17150);
    expect(closed.error).toBeNull();
    expect(closed.data).toMatchObject({ expected_cash: 17150, variance: 0, pay_ins: 5000, paid_outs: 20000, drops: 30000 });

    // A closed shift takes no more movements.
    expect((await move(manager, 'drop', 1000)).error?.message).toBe('NO_OPEN_SHIFT');
  });

  it('refuses bad input and people who may not move cash', async () => {
    const shiftId = await openShift(manager);
    expect((await move(manager, 'paid_out', 0)).error?.message).toBe('INVALID_AMOUNT');
    expect((await move(manager, 'paid_out', -5)).error?.message).toBe('INVALID_AMOUNT');
    expect((await move(manager, 'paid_out', 1000, '   ')).error?.message).toBe('REASON_REQUIRED');
    expect((await move(waiter, 'paid_out', 1000)).error?.message).toBe('FORBIDDEN');
    expect((await move(otherCashier, 'paid_out', 1000)).error?.message).toBe('NO_OPEN_SHIFT');
    expect(await sql(`select count(*)::int as n from cash_movements where till_shift_id = $1`, [shiftId])).toEqual([{ n: 0 }]);
    expect((await closeShift(manager, 50000)).error).toBeNull();
  });

  it('a replayed key returns the same movement and writes one row', async () => {
    const shiftId = await openShift(manager);
    const key = testIdemKey('cash');
    const first = await move(manager, 'paid_out', 7000, 'ice', key);
    const again = await move(manager, 'paid_out', 7000, 'ice', key);
    expect(first.error).toBeNull();
    expect(again.data).toEqual(first.data);
    expect(await sql(`select count(*)::int as n from cash_movements where till_shift_id = $1`, [shiftId])).toEqual([{ n: 1 }]);
    expect((await closeShift(manager, 43000)).data).toMatchObject({ expected_cash: 43000, variance: 0 });
  });

  it('is append-only, and a cashier reads only their own', async () => {
    const shiftId = await openShift(cashier);
    await grant(cashier, shiftId, 2000);
    const done = await move(cashier, 'paid_out', 2000, 'napkins');
    const id = (done.data as { movement_id: string }).movement_id;

    await expect(sql(`update cash_movements set amount = 1 where id = $1`, [id])).rejects.toThrow();
    await expect(sql(`delete from cash_movements where id = $1`, [id])).rejects.toThrow();
    const write = await cashier.client.from('cash_movements').insert({ till_shift_id: shiftId, kind: 'pay_in', amount: 1, reason: 'x' });
    expect(write.error).not.toBeNull();

    const read = (who: TestStaff) => who.client.from('cash_movements').select('id').eq('id', id);
    expect((await read(cashier)).data).toEqual([{ id }]);
    expect((await read(manager)).data).toEqual([{ id }]);
    expect((await read(otherCashier)).data).toEqual([]);
    expect((await read(waiter)).data).toEqual([]);
    expect((await closeShift(cashier, 48000)).error).toBeNull();
  });

  it('the day summary totals the movements made during the day', async () => {
    const [before] = await sql<{ paid_outs: number; pay_ins: number; drops: number }>(
      `select coalesce(sum(amount) filter (where kind = 'paid_out'), 0)::int as paid_outs,
              coalesce(sum(amount) filter (where kind = 'pay_in'), 0)::int as pay_ins,
              coalesce(sum(amount) filter (where kind = 'drop'), 0)::int as drops
         from cash_movements where day_session_id = $1`,
      [dayId],
    );
    await sql(`update tabs set status = 'void', closed_at = now() where status = 'open'`);
    const closed = await appRpc(manager.client, 'close_day');
    expect(closed.error).toBeNull();
    expect((closed.data as { summary: Record<string, number> }).summary).toMatchObject({
      paid_outs: before?.paid_outs,
      pay_ins: before?.pay_ins,
      drops: before?.drops,
    });
    expect(before?.paid_outs).toBeGreaterThan(0);
  });
});
