/**
 * Discounts, payments, splits and refunds: the happy path end to end, validation,
 * idempotent replay, the manager PIN gate, and two parallel settles on one tab.
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
import { addItems, grantPin, makeMenu, openFreshDay, openTab, totals, type Menu } from './money-fixtures';

const up = await stackAvailable();
const PIN = uniquePin();

describe.skipIf(!up)('discounts, payments, splits and refunds', () => {
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

  const settle = (
    staff: TestStaff,
    tab: string,
    method: 'cash' | 'card',
    amount: number,
    tendered: number | null = null,
    key = testIdemKey('pay'),
  ) =>
    appRpc(staff.client, 'settle_tab', {
      p_tab_id: tab,
      p_method: method,
      p_amount: amount,
      p_tendered: tendered,
      p_device_id: 'payments-test',
      p_idempotency_key: key,
    });

  /** A tab with burger (12,000, 10%) + tea (1,500, 0%) = 13,500. */
  async function billedTab(): Promise<{ tab: string; burger: string; tea: string }> {
    const tab = await openTab(waiter);
    const [burger, tea] = await addItems(waiter, tab, [
      { menu_item_id: menu.burger, qty: 1 },
      { menu_item_id: menu.tea, qty: 1 },
    ]);
    return { tab, burger: burger!, tea: tea! };
  }

  it('happy path: open, add, discount, split, settle with change, refund', async () => {
    const { tab, burger } = await billedTab();
    expect(await totals(waiter, tab)).toEqual({
      subtotal: 13500,
      discount: 0,
      tax: 1091,
      total: 13500,
      paid: 0,
      refunded: 0,
      due: 13500,
    });

    await grantPin(cashier, PIN, 'discount');
    const disc = await appRpc(cashier.client, 'apply_discount', {
      p_tab_id: tab,
      p_kind: 'discount_percent',
      p_value: 1000,
      p_reason: 'birthday',
      p_idempotency_key: testIdemKey('discount'),
    });
    expect(disc.error).toBeNull();
    expect(disc.data).toMatchObject({ amount: 1350, totals: { discount: 1350, tax: 982, total: 12150, due: 12150 } });
    const [adj] = await sql(`select applied_by, authorized_by, value::int, amount::int from tab_adjustments where tab_id = $1`, [
      tab,
    ]);
    expect(adj).toEqual({ applied_by: cashier.id, authorized_by: manager.id, value: 1000, amount: 1350 });

    const even = await appRpc(cashier.client, 'split_evenly', { p_tab_id: tab, p_n: 7 });
    expect(even.error).toBeNull();
    // 12,150 / 7 = 1,735 r 5: the first five shares carry the extra dinar.
    expect(even.data).toEqual({ due: 12150, shares: [1736, 1736, 1736, 1736, 1736, 1735, 1735] });

    const byItem = await appRpc(cashier.client, 'split_by_item', { p_tab_id: tab, p_order_item_ids: [burger] });
    expect(byItem.error).toBeNull();
    // The burger carries 1,200 of the 1,350 discount (12,000 / 13,500 of it).
    expect(byItem.data).toEqual({
      amount: 10800,
      due: 12150,
      lines: [{ order_item_id: burger, line_total: 12000, discount: 1200, amount: 10800 }],
    });

    const cash = await settle(cashier, tab, 'cash', 10800, 20000);
    expect(cash.error).toBeNull();
    expect(cash.data).toMatchObject({ change: 9200, status: 'open', totals: { paid: 10800, due: 1350 } });

    const card = await settle(cashier, tab, 'card', 1350);
    expect(card.error).toBeNull();
    expect(card.data).toMatchObject({ change: 0, status: 'settled', totals: { paid: 12150, due: 0 } });
    expect(await sql(`select status, closed_at is not null as closed from tabs where id = $1`, [tab])).toEqual([
      { status: 'settled', closed: true },
    ]);

    await grantPin(cashier, PIN, 'refund');
    const refund = await appRpc(cashier.client, 'refund', {
      p_payment_id: (card.data as { payment_id: string }).payment_id,
      p_amount: 1350,
      p_reason: 'cold food',
      p_device_id: 'payments-test',
      p_idempotency_key: testIdemKey('refund'),
    });
    expect(refund.error).toBeNull();
    expect(refund.data).toMatchObject({ amount: 1350, method: 'card', totals: { refunded: 1350, due: 0 } });
    const [row] = await sql(`select refunded_by, authorized_by from refunds where tab_id = $1`, [tab]);
    expect(row).toEqual({ refunded_by: cashier.id, authorized_by: manager.id });
  });

  it('discount and refund need a PIN from a cashier, none from a manager', async () => {
    const { tab } = await billedTab();
    const discount = (s: TestStaff) =>
      appRpc(s.client, 'apply_discount', {
        p_tab_id: tab,
        p_kind: 'discount_amount',
        p_value: 500,
        p_reason: 'r',
        p_idempotency_key: testIdemKey('discount'),
      });
    expect((await discount(cashier)).error?.message).toBe('PIN_GRANT_REQUIRED');
    expect((await discount(manager)).error).toBeNull();
    expect(await sql(`select authorized_by from tab_adjustments where tab_id = $1`, [tab])).toEqual([
      { authorized_by: manager.id },
    ]);

    const pay = await settle(cashier, tab, 'card', 13000);
    const paymentId = (pay.data as { payment_id: string }).payment_id;
    const refund = (s: TestStaff) =>
      appRpc(s.client, 'refund', {
        p_payment_id: paymentId,
        p_amount: 100,
        p_reason: 'r',
        p_device_id: 'payments-test',
        p_idempotency_key: testIdemKey('refund'),
      });
    expect((await refund(cashier)).error?.message).toBe('PIN_GRANT_REQUIRED');
    expect((await refund(manager)).error).toBeNull();
  });

  it('validates discounts', async () => {
    const { tab } = await billedTab();
    const discount = (kind: string, value: number, reason = 'r') =>
      appRpc(manager.client, 'apply_discount', {
        p_tab_id: tab,
        p_kind: kind,
        p_value: value,
        p_reason: reason,
        p_idempotency_key: testIdemKey('discount'),
      });
    expect((await discount('discount_amount', 0)).error?.message).toBe('INVALID_DISCOUNT');
    expect((await discount('discount_percent', 10001)).error?.message).toBe('INVALID_DISCOUNT');
    expect((await discount('discount_amount', 100, ' ')).error?.message).toBe('REASON_REQUIRED');
    // Capped at the subtotal: asking for more takes what is left, and a tab
    // discounted to 0 is settled.
    expect((await discount('discount_amount', 20000)).data).toMatchObject({ amount: 13500, totals: { total: 0 } });
    expect((await discount('discount_amount', 1)).error?.message).toBe('TAB_NOT_OPEN');
    // Nothing left to take off: an empty tab.
    const empty = await openTab(waiter);
    const none = await appRpc(manager.client, 'apply_discount', {
      p_tab_id: empty,
      p_kind: 'discount_percent',
      p_value: 1000,
      p_reason: 'r',
      p_idempotency_key: testIdemKey('discount'),
    });
    expect(none.error?.message).toBe('NOTHING_TO_DISCOUNT');
  });

  it('refuses over-payment, low tender and a non-positive amount', async () => {
    const { tab } = await billedTab();
    expect((await settle(cashier, tab, 'card', 13501)).error?.message).toBe('OVERPAYMENT');
    expect((await settle(cashier, tab, 'cash', 5000, 4000)).error?.message).toBe('TENDERED_TOO_LOW');
    expect((await settle(cashier, tab, 'cash', 5000, null)).error?.message).toBe('TENDERED_TOO_LOW');
    expect((await settle(cashier, tab, 'card', 0)).error?.message).toBe('INVALID_AMOUNT');
    expect(await sql(`select 1 from payments where tab_id = $1`, [tab])).toHaveLength(0);
    expect((await settle(cashier, tab, 'card', 13500)).error).toBeNull();
    expect((await settle(cashier, tab, 'card', 1)).error?.message).toBe('TAB_NOT_OPEN');
  });

  it('settle_tab replays its key: one payment, the same answer', async () => {
    const { tab } = await billedTab();
    const key = testIdemKey('pay');
    const first = await settle(cashier, tab, 'cash', 5000, 10000, key);
    const again = await settle(cashier, tab, 'cash', 5000, 10000, key);
    expect(first.error).toBeNull();
    expect(again.data).toEqual(first.data);
    expect(await sql(`select 1 from payments where tab_id = $1`, [tab])).toHaveLength(1);
  });

  it('refund replays its key, refuses over-refund and an open tab', async () => {
    const { tab } = await billedTab();
    const part = await settle(cashier, tab, 'card', 3500);
    const partId = (part.data as { payment_id: string }).payment_id;
    const refundOf = (paymentId: string, amount: number, key = testIdemKey('refund')) =>
      appRpc(manager.client, 'refund', {
        p_payment_id: paymentId,
        p_amount: amount,
        p_reason: 'r',
        p_device_id: 'payments-test',
        p_idempotency_key: key,
      });
    expect((await refundOf(partId, 100)).error?.message).toBe('TAB_NOT_SETTLED');

    await settle(cashier, tab, 'card', 10000);
    const key = testIdemKey('refund');
    const first = await refundOf(partId, 2000, key);
    expect(first.error).toBeNull();
    expect((await refundOf(partId, 2000, key)).data).toEqual(first.data);
    expect(await sql(`select 1 from refunds where payment_id = $1`, [partId])).toHaveLength(1);
    expect((await refundOf(partId, 1501)).error?.message).toBe('OVER_REFUND');
    expect((await refundOf(partId, 1500)).error).toBeNull();
  });

  it('two parallel settles on one tab never over-pay it', async () => {
    const tab = await openTab(waiter);
    await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
    const results = await Promise.all([
      settle(cashier, tab, 'card', 8000),
      settle(manager, tab, 'card', 8000),
    ]);
    const errors = results.map((r) => r.error?.message ?? null).sort();
    expect(errors).toEqual(['OVERPAYMENT', null].sort());
    expect((await totals(waiter, tab)).paid).toBe(8000);
  });

  it('a void that would leave the tab below what was paid is refused', async () => {
    const { tab, burger } = await billedTab();
    await settle(cashier, tab, 'card', 5000);
    const { error } = await appRpc(manager.client, 'void_item', { p_order_item_id: burger, p_reason: 'r' });
    expect(error?.message).toBe('PAID_EXCEEDS_TOTAL');
  });

  it('split validation', async () => {
    const { tab } = await billedTab();
    expect((await appRpc(cashier.client, 'split_evenly', { p_tab_id: tab, p_n: 0 })).error?.message).toBe(
      'INVALID_SPLIT',
    );
    const other = await billedTab();
    const { error } = await appRpc(cashier.client, 'split_by_item', { p_tab_id: tab, p_order_item_ids: [other.burger] });
    expect(error?.message).toBe('LINE_NOT_ON_TAB');
  });
});
