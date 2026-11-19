/**
 * Review fixes for the money functions, each reproduced end to end:
 *  - a percent discount follows the live subtotal after a void;
 *  - apply_discount replays its idempotency key;
 *  - a refund is stamped to the REFUNDING device's shift, and cash taken on a
 *    device whose shift belongs to someone else is kept but audited;
 *  - a refund lands in the business day it happened in, even after its tab's day closed;
 *  - a tab whose total is 0 settles;
 *  - merge_tabs refuses a source with discounts.
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
const rnd = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!up)('money review fixes', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let cashier2: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;
  /** 90,000 IQD and 10,000 IQD items, 0% tax. */
  let big: string;
  let small: string;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', PIN);
    cashier = await createStaffOfRole('cashier');
    cashier2 = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    const [tea] = await sql<{ category_id: string; tax_group_id: string }>(
      `select category_id, tax_group_id from menu_items where id = $1`,
      [menu.tea],
    );
    const item = async (price: number) =>
      (
        await sql<{ id: string }>(
          `insert into menu_items (category_id, name_en, name_ar, price, tax_group_id)
           values ($1, $2, $2, $3, $4) returning id`,
          [tea!.category_id, `Review ${price}`, price, tea!.tax_group_id],
        )
      )[0]!.id;
    big = await item(90000);
    small = await item(10000);
    await openFreshDay(manager);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const discount = (s: TestStaff, tab: string, kind: string, value: number, key = testIdemKey('discount')) =>
    appRpc(s.client, 'apply_discount', {
      p_tab_id: tab,
      p_kind: kind,
      p_value: value,
      p_reason: 'regular',
      p_idempotency_key: key,
    });

  const settle = (s: TestStaff, tab: string, method: 'cash' | 'card', amount: number, device: string) =>
    appRpc(s.client, 'settle_tab', {
      p_tab_id: tab,
      p_method: method,
      p_amount: amount,
      p_tendered: method === 'cash' ? amount : null,
      p_device_id: device,
      p_idempotency_key: testIdemKey('pay'),
    });

  const refund = (s: TestStaff, payment: string, amount: number, device: string, key = testIdemKey('refund')) =>
    appRpc(s.client, 'refund', {
      p_payment_id: payment,
      p_amount: amount,
      p_reason: 'cold food',
      p_device_id: device,
      p_idempotency_key: key,
    });

  const voidLine = (s: TestStaff, line: string) =>
    appRpc(s.client, 'void_item', { p_order_item_id: line, p_reason: 'wrong item' });

  describe('a percent discount after a void', () => {
    it('10% of 90,000 + 10,000, then the 90,000 line voided: total is 9,000, not 0', async () => {
      const tab = await openTab(waiter);
      const [bigLine] = await addItems(waiter, tab, [
        { menu_item_id: big, qty: 1 },
        { menu_item_id: small, qty: 1 },
      ]);
      const d = await discount(manager, tab, 'discount_percent', 1000);
      expect(d.error).toBeNull();
      expect(d.data).toMatchObject({ amount: 10000, totals: { subtotal: 100000, discount: 10000, total: 90000 } });

      const v = await voidLine(manager, bigLine!);
      expect(v.error).toBeNull();
      expect(v.data).toMatchObject({ totals: { subtotal: 10000, discount: 1000, total: 9000, due: 9000 } });
      expect(await sql(`select status from tabs where id = $1`, [tab])).toEqual([{ status: 'open' }]);
    });

    it('an amount discount stays fixed after a void, capped at the new subtotal', async () => {
      const tab = await openTab(waiter);
      const [bigLine] = await addItems(waiter, tab, [
        { menu_item_id: big, qty: 1 },
        { menu_item_id: small, qty: 1 },
      ]);
      expect((await discount(manager, tab, 'discount_amount', 5000)).error).toBeNull();
      await voidLine(manager, bigLine!);
      expect(await totals(manager, tab)).toMatchObject({ subtotal: 10000, discount: 5000, total: 5000 });
    });
  });

  describe('apply_discount idempotency', () => {
    it('replays its key: one adjustment, the same answer', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: small, qty: 1 }]);
      const key = testIdemKey('discount');
      const first = await discount(manager, tab, 'discount_amount', 500, key);
      expect(first.error).toBeNull();
      const again = await discount(manager, tab, 'discount_amount', 500, key);
      expect(again.error).toBeNull();
      expect(again.data).toEqual(first.data);
      expect(await sql(`select 1 from tab_adjustments where tab_id = $1`, [tab])).toHaveLength(1);
    });

    it('requires a key', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: small, qty: 1 }]);
      const { error } = await appRpc(manager.client, 'apply_discount', {
        p_tab_id: tab,
        p_kind: 'discount_amount',
        p_value: 500,
        p_reason: 'r',
        p_idempotency_key: null,
      });
      expect(error?.message).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  describe('which drawer a refund and a payment land in', () => {
    it('a refund is stamped to the open shift of the refunding device', async () => {
      const d1 = `till-${rnd()}`;
      const d2 = `till-${rnd()}`;
      const s1 = (await appRpc(cashier.client, 'open_till_shift', { p_device_id: d1, p_opening_float: 0 })).data as {
        shift_id: string;
      };
      const s2 = (await appRpc(cashier2.client, 'open_till_shift', { p_device_id: d2, p_opening_float: 0 })).data as {
        shift_id: string;
      };
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: small, qty: 1 }]);
      const pay = await settle(cashier, tab, 'cash', 10000, d1);
      expect(pay.error).toBeNull();
      const payment = (pay.data as { payment_id: string; till_shift_id: string });
      expect(payment.till_shift_id).toBe(s1.shift_id);

      await grantPin(cashier2, PIN, 'refund');
      const r = await refund(cashier2, payment.payment_id, 2000, d2);
      expect(r.error).toBeNull();
      expect(r.data).toMatchObject({ till_shift_id: s2.shift_id });
      expect(await sql(`select till_shift_id, device_id from refunds where tab_id = $1`, [tab])).toEqual([
        { till_shift_id: s2.shift_id, device_id: d2 },
      ]);
      // The cashier refunded from her own drawer: no mismatch.
      expect(await sql(`select 1 from audit_log where action = 'refund.shift_mismatch' and entity_id = $1`, [
        (r.data as { refund_id: string }).refund_id,
      ])).toHaveLength(0);

      // Closing the second drawer counts the cash refund against it.
      const closed = await appRpc(cashier2.client, 'close_till_shift', { p_counted_cash: 0 });
      expect(closed.data).toMatchObject({ expected_cash: 0, variance: 0 });
      await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 10000 });
    });

    it('a refund needs a device', async () => {
      const { error } = await refund(manager, '00000000-0000-4000-8000-00000000dead', 1, ' ');
      expect(error?.message).toBe('DEVICE_REQUIRED');
    });

    it("cash on a device whose open shift is someone else's is kept, stamped to that shift and audited", async () => {
      const d = `till-${rnd()}`;
      const s = (await appRpc(cashier.client, 'open_till_shift', { p_device_id: d, p_opening_float: 0 })).data as {
        shift_id: string;
      };
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: small, qty: 1 }]);
      const pay = await settle(cashier2, tab, 'cash', 10000, d);
      expect(pay.error).toBeNull();
      const payment = pay.data as { payment_id: string; till_shift_id: string; status: string };
      expect(payment).toMatchObject({ till_shift_id: s.shift_id, status: 'settled' });
      const [audit] = await sql(
        `select actor_id, after ->> 'till_shift_id' as shift, after ->> 'shift_staff_id' as owner
           from audit_log where action = 'payment.shift_mismatch' and entity_id = $1`,
        [payment.payment_id],
      );
      expect(audit).toEqual({ actor_id: cashier2.id, shift: s.shift_id, owner: cashier.id });

      // A card payment moves no cash: no mismatch is audited.
      const tab2 = await openTab(waiter);
      await addItems(waiter, tab2, [{ menu_item_id: small, qty: 1 }]);
      const card = await settle(cashier2, tab2, 'card', 10000, d);
      expect(
        await sql(`select 1 from audit_log where action = 'payment.shift_mismatch' and entity_id = $1`, [
          (card.data as { payment_id: string }).payment_id,
        ]),
      ).toHaveLength(0);

      // A cash refund from that drawer by someone else is also kept and audited.
      const r = await refund(manager, payment.payment_id, 1000, d);
      expect(r.error).toBeNull();
      expect(r.data).toMatchObject({ till_shift_id: s.shift_id });
      expect(
        await sql(`select 1 from audit_log where action = 'refund.shift_mismatch' and entity_id = $1`, [
          (r.data as { refund_id: string }).refund_id,
        ]),
      ).toHaveLength(1);
      await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 9000 });
    });
  });

  describe('a tab whose total is 0', () => {
    it('a 100% discount settles the tab', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: small, qty: 1 }]);
      const d = await discount(manager, tab, 'discount_percent', 10000);
      expect(d.error).toBeNull();
      expect(d.data).toMatchObject({ totals: { total: 0, due: 0, paid: 0 } });
      expect(await sql(`select status, closed_at is not null as closed from tabs where id = $1`, [tab])).toEqual([
        { status: 'settled', closed: true },
      ]);
    });

    it('a void that leaves only discounted lines at total 0 settles the tab', async () => {
      const tab = await openTab(waiter);
      const [bigLine] = await addItems(waiter, tab, [
        { menu_item_id: big, qty: 1 },
        { menu_item_id: small, qty: 1 },
      ]);
      expect((await discount(manager, tab, 'discount_amount', 10000)).error).toBeNull();
      expect((await voidLine(manager, bigLine!)).error).toBeNull();
      expect(await sql(`select status from tabs where id = $1`, [tab])).toEqual([{ status: 'settled' }]);
    });
  });

  describe('merge_tabs and discounts', () => {
    it('refuses a source with a discount, so no discount crosses over uncapped', async () => {
      const from = await openTab(waiter);
      const into = await openTab(waiter);
      await addItems(waiter, from, [{ menu_item_id: small, qty: 1 }]);
      await addItems(waiter, into, [{ menu_item_id: menu.tea, qty: 1 }]);
      expect((await discount(manager, from, 'discount_amount', 9000)).error).toBeNull();
      const { error } = await appRpc(waiter.client, 'merge_tabs', { p_from: from, p_into: into });
      expect(error?.message).toBe('MERGE_SOURCE_HAS_DISCOUNTS');
      expect(await sql(`select status from tabs where id = $1`, [from])).toEqual([{ status: 'open' }]);
    });

    it('a discounted target still merges, and its percent follows the new subtotal', async () => {
      const from = await openTab(waiter);
      const into = await openTab(waiter);
      await addItems(waiter, from, [{ menu_item_id: big, qty: 1 }]);
      await addItems(waiter, into, [{ menu_item_id: small, qty: 1 }]);
      expect((await discount(manager, into, 'discount_percent', 1000)).error).toBeNull();
      const m = await appRpc(waiter.client, 'merge_tabs', { p_from: from, p_into: into });
      expect(m.error).toBeNull();
      expect(m.data).toMatchObject({ totals: { subtotal: 100000, discount: 10000, total: 90000 } });
    });
  });
});

describe.skipIf(!up)('a refund after its tab’s day closed', () => {
  let manager: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  /** Close the open day through close_day, then open the next one. */
  async function rollDay(): Promise<{ closed: Record<string, unknown> }> {
    const closed = await appRpc(manager.client, 'close_day');
    if (closed.error) throw new Error(`close_day failed: ${closed.error.message}`);
    await sql(
      `update day_sessions set business_date = (select min(business_date) - 1 from day_sessions)
        where business_date = app.business_date()`,
    );
    return { closed: closed.data as Record<string, unknown> };
  }

  it('lands in the day it was given back in, and is refused while no day is open', async () => {
    const day1 = await openFreshDay(manager);
    const tab = await openTab(waiter);
    await addItems(waiter, tab, [{ menu_item_id: menu.tea, qty: 2 }]); // 3,000
    const pay = await appRpc(manager.client, 'settle_tab', {
      p_tab_id: tab,
      p_method: 'card',
      p_amount: 3000,
      p_tendered: null,
      p_device_id: 'day-test',
      p_idempotency_key: testIdemKey('pay'),
    });
    expect(pay.error).toBeNull();
    const paymentId = (pay.data as { payment_id: string }).payment_id;

    const { closed } = await rollDay();
    expect(closed).toMatchObject({ day_session_id: day1, summary: { refunds: 0, card: 3000, net: 3000 } });

    const refundOnce = () =>
      appRpc(manager.client, 'refund', {
        p_payment_id: paymentId,
        p_amount: 1000,
        p_reason: 'late complaint',
        p_device_id: 'day-test',
        p_idempotency_key: testIdemKey('refund'),
      });
    // No day open: refused, so no refund escapes every summary.
    expect((await refundOnce()).error?.message).toBe('DAY_NOT_OPEN');

    const day2 = (await appRpc(manager.client, 'open_day')).data as { day_session_id: string };
    const r = await refundOnce();
    expect(r.error).toBeNull();
    expect(
      await sql(`select day_session_id from refunds where id = $1`, [(r.data as { refund_id: string }).refund_id]),
    ).toEqual([{ day_session_id: day2.day_session_id }]);

    const second = await appRpc(manager.client, 'close_day');
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({
      day_session_id: day2.day_session_id,
      summary: { gross: 0, refunds: 1000, net: -1000, card: -1000, cash: 0, tabs: 0 },
    });
    await openFreshDay(manager);
  });
});
