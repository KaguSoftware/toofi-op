/**
 * Till shifts: open with a float, payments and refunds stamped with the device's
 * open shift (a missing shift never blocks money), blind close with variance,
 * closing another person's shift behind a PIN, drawer events, and the views.
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
import { addItems, grantPin, makeMenu, openFreshDay, openTab, type Menu } from './money-fixtures';

const up = await stackAvailable();
const PIN = uniquePin();
const rnd = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!up)('till shifts', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', PIN);
    cashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    await openFreshDay(manager);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const pay = (tab: string, method: 'cash' | 'card', amount: number, tendered: number | null, device: string) =>
    appRpc(cashier.client, 'settle_tab', {
      p_tab_id: tab,
      p_method: method,
      p_amount: amount,
      p_tendered: tendered,
      p_device_id: device,
      p_idempotency_key: testIdemKey('pay'),
    });

  it('stamps payments and refunds, then closes blind with the variance', async () => {
    const device = `till-${rnd()}`;
    const opened = await appRpc(cashier.client, 'open_till_shift', { p_device_id: device, p_opening_float: 50000 });
    expect(opened.error).toBeNull();
    const shiftId = (opened.data as { shift_id: string }).shift_id;
    expect(
      (await appRpc(cashier.client, 'open_till_shift', { p_device_id: device, p_opening_float: 0 })).error?.message,
    ).toBe('SHIFT_ALREADY_OPEN');

    const status = await appRpc(cashier.client, 'till_shift_status', { p_device_id: device });
    expect(status.data).toMatchObject({ open: true, shift_id: shiftId, staff_id: cashier.id, opening_float: 50000 });
    expect(status.data).not.toHaveProperty('expected_cash');

    // burger + tea = 13,500: 12,150 cash (tendered 20,000), 1,350 card.
    const tab = await openTab(waiter);
    await addItems(waiter, tab, [
      { menu_item_id: menu.burger, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    const cash = await pay(tab, 'cash', 12150, 20000, device);
    await pay(tab, 'card', 1350, null, device);
    expect(await sql(`select distinct till_shift_id from payments where tab_id = $1`, [tab])).toEqual([
      { till_shift_id: shiftId },
    ]);

    const refund = await appRpc(manager.client, 'refund', {
      p_payment_id: (cash.data as { payment_id: string }).payment_id,
      p_amount: 650,
      p_reason: 'r',
      p_device_id: device,
      p_idempotency_key: testIdemKey('refund'),
    });
    expect(refund.error).toBeNull();
    expect(await sql(`select till_shift_id from refunds where tab_id = $1`, [tab])).toEqual([{ till_shift_id: shiftId }]);

    expect((await appRpc(cashier.client, 'record_drawer_open', { p_reason: 'change for 25k' })).error).toBeNull();
    expect(await sql(`select staff_id from drawer_events where till_shift_id = $1`, [shiftId])).toEqual([
      { staff_id: cashier.id },
    ]);

    // Expected = 50,000 float + 12,150 cash - 650 cash refund = 61,500.
    const closed = await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 61000 });
    expect(closed.error).toBeNull();
    expect(closed.data).toMatchObject({ shift_id: shiftId, counted_cash: 61000, expected_cash: 61500, variance: -500 });
    expect(await sql(`select variance::int, closed_by from till_shifts where id = $1`, [shiftId])).toEqual([
      { variance: -500, closed_by: cashier.id },
    ]);
    expect((await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 0 })).error?.message).toBe(
      'NO_OPEN_SHIFT',
    );
    expect((await appRpc(cashier.client, 'till_shift_status', { p_device_id: device })).data).toEqual({ open: false });
  });

  it('a payment with no open shift still goes through, unstamped', async () => {
    const tab = await openTab(waiter);
    await addItems(waiter, tab, [{ menu_item_id: menu.tea, qty: 1 }]);
    const { error } = await pay(tab, 'cash', 1500, 2000, `no-shift-${rnd()}`);
    expect(error).toBeNull();
    expect(await sql(`select till_shift_id from payments where tab_id = $1`, [tab])).toEqual([{ till_shift_id: null }]);
  });

  it('a drawer open needs an open shift', async () => {
    const other = await createStaffOfRole('cashier');
    expect((await appRpc(other.client, 'record_drawer_open', { p_reason: 'x' })).error?.message).toBe('NO_OPEN_SHIFT');
  });

  it("closing another person's shift needs a PIN from a cashier, none from a manager", async () => {
    const owner = await createStaffOfRole('cashier');
    const open = async () =>
      (
        (await appRpc(owner.client, 'open_till_shift', { p_device_id: `till-${rnd()}`, p_opening_float: 1000 }))
          .data as { shift_id: string }
      ).shift_id;

    const first = await open();
    const closeFor = (s: TestStaff, id: string) =>
      appRpc(s.client, 'close_till_shift_for', { p_shift_id: id, p_counted_cash: 1200 });
    expect((await closeFor(cashier, first)).error?.message).toBe('PIN_GRANT_REQUIRED');
    await grantPin(cashier, PIN, 'close_till_shift');
    const done = await closeFor(cashier, first);
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({ expected_cash: 1000, variance: 200 });
    const [audit] = await sql(
      `select actor_id, authorized_by from audit_log where action = 'till_shift.close' and entity_id = $1`,
      [first],
    );
    expect(audit).toEqual({ actor_id: cashier.id, authorized_by: manager.id });
    expect((await closeFor(manager, first)).error?.message).toBe('SHIFT_NOT_OPEN');

    const second = await open();
    expect((await closeFor(manager, second)).error).toBeNull();
  });

  it('the floor and open-tab views show each open tab with what is due', async () => {
    const tab = await openTab(waiter, 3);
    await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 2 }]);
    const floor = await waiter.client.from('v_floor_status').select('*').eq('tab_id', tab);
    expect(floor.error).toBeNull();
    expect(floor.data).toEqual([
      expect.objectContaining({ tab_id: tab, covers: 3, due: 24000, waiter_id: waiter.id, waiter_name: 'Test waiter' }),
    ]);
    const open = await cashier.client.from('v_open_tabs').select('*').eq('tab_id', tab);
    expect(open.data).toEqual([expect.objectContaining({ tab_id: tab, total: 24000, paid: 0, due: 24000 })]);
  });
});
