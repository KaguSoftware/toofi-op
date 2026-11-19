/**
 * Business day: open_day and close_day. close_day refuses while any tab is open,
 * and stores the day's summary snapshot.
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
import { addItems, makeMenu, makeTable, openFreshDay, openTab, type Menu } from './money-fixtures';

const up = await stackAvailable();

describe.skipIf(!up)('business day', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;
  let dayId: string;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', uniquePin());
    cashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    dayId = await openFreshDay(manager);
  });

  afterAll(async () => {
    await openFreshDay(manager); // leave an open day behind for the next file
    await cleanupStaff();
    await endDb();
  });

  it('open_day records the venue business date and refuses a second open day', async () => {
    const [row] = await sql<{ ok: boolean; opened_by: string }>(
      `select business_date = app.business_date() as ok, opened_by from day_sessions where id = $1`,
      [dayId],
    );
    expect(row).toEqual({ ok: true, opened_by: manager.id });
    const { error } = await appRpc(manager.client, 'open_day');
    expect(error?.message).toBe('DAY_ALREADY_OPEN');
  });

  it('close_day refuses while a tab is open, then stores the summary', async () => {
    // A settled tab: burger 12,000 + tea x2 (3,000, voided), 2,000 off, paid
    // 6,000 cash + 4,000 card, then 1,000 of the card payment refunded.
    const tab = await openTab(waiter, 3);
    const [, teaLine] = await addItems(waiter, tab, [
      { menu_item_id: menu.burger, qty: 1 },
      { menu_item_id: menu.tea, qty: 2 },
    ]);
    expect((await appRpc(manager.client, 'void_item', { p_order_item_id: teaLine, p_reason: 'wrong' })).error).toBeNull();
    expect(
      (
        await appRpc(manager.client, 'apply_discount', {
          p_tab_id: tab,
          p_kind: 'discount_amount',
          p_value: 2000,
          p_reason: 'regular',
          p_idempotency_key: testIdemKey('discount'),
        })
      ).error,
    ).toBeNull();
    const pay = (method: string, amount: number, tendered: number | null) =>
      appRpc(cashier.client, 'settle_tab', {
        p_tab_id: tab,
        p_method: method,
        p_amount: amount,
        p_tendered: tendered,
        p_device_id: 'day-test',
        p_idempotency_key: testIdemKey('pay'),
      });
    expect((await pay('cash', 6000, 10000)).error).toBeNull();
    const card = await pay('card', 4000, null);
    expect(card.error).toBeNull();
    expect((card.data as { status: string }).status).toBe('settled');
    const refund = await appRpc(manager.client, 'refund', {
      p_payment_id: (card.data as { payment_id: string }).payment_id,
      p_amount: 1000,
      p_reason: 'cold',
      p_device_id: 'day-test',
      p_idempotency_key: testIdemKey('refund'),
    });
    expect(refund.error).toBeNull();

    // An empty tab still open blocks the close.
    const open = await openTab(waiter);
    const blocked = await appRpc(manager.client, 'close_day');
    expect(blocked.error?.message).toBe('OPEN_TABS_EXIST');
    expect((await appRpc(waiter.client, 'cancel_tab', { p_tab_id: open, p_reason: 'left' })).error).toBeNull();

    const { data, error } = await appRpc(manager.client, 'close_day');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      day_session_id: dayId,
      summary: {
        gross: 12000,
        discounts: 2000,
        refunds: 1000,
        net: 9000,
        cash: 6000,
        card: 3000,
        voids_count: 1,
        voids_value: 3000,
        covers: 3,
        tabs: 1,
      },
    });
    const [day] = await sql<{ closed_by: string; summary: { net: number } }>(
      `select closed_by, summary from day_sessions where id = $1`,
      [dayId],
    );
    expect(day?.closed_by).toBe(manager.id);
    expect(day?.summary.net).toBe(9000);
  });

  it('without an open day, open_tab raises DAY_NOT_OPEN and close_day too', async () => {
    const { error } = await appRpc(waiter.client, 'open_tab', {
      p_table_id: await makeTable(),
      p_covers: 2,
      p_idempotency_key: testIdemKey('tab'),
    });
    expect(error?.message).toBe('DAY_NOT_OPEN');
    expect((await appRpc(manager.client, 'close_day')).error?.message).toBe('DAY_NOT_OPEN');
  });

  it('a business date already closed cannot be opened again', async () => {
    const { error } = await appRpc(manager.client, 'open_day');
    expect(error?.message).toBe('DAY_ALREADY_CLOSED');
  });
});
