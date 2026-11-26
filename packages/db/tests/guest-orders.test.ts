/**
 * Guest QR menu, part 3: guest orders. send_guest_order (server pricing,
 * validation, limits, note cleaning, switches, replay, nothing written to money
 * or stock), accept_guest_order and decline_guest_order (tabs, replay, double
 * taps, concurrency, closed day, price change, item gone), and guest_inbox.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sql,
  stackAvailable,
  testIdemKey,
  type TestStaff,
} from './helpers';
import { makeMenu, makeTable, openFreshDay, type Menu } from './money-fixtures';
import {
  closeDayDirectly,
  guestKey,
  guestRpc,
  openSession,
  sendOrder,
  serviceRowsFor,
  setVenueSwitches,
  stockMovementCount,
  type GuestLine,
} from './guest-fixtures';

const up = await stackAvailable();
const NO_ROW = '00000000-0000-4000-8000-00000000dead';

interface Line {
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  qty: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  modifiers: { id: string; name_en: string; price_delta: number }[];
}

interface Sent {
  guest_order_id: string;
  status: string;
  lines: Line[];
  total: number;
  sent_at: string;
}

interface Accepted {
  guest_order_id: string;
  status: string;
  tab_id: string;
  order_id: string;
  totals: { total: number; subtotal: number };
  already: boolean;
}

interface InboxOrder {
  id: string;
  table_id: string;
  table_label: string;
  sent_at: string;
  lines: Line[];
  total: number;
  current_total: number | null;
  price_changed: boolean;
  unavailable: boolean;
  table_has_tab: boolean;
}

describe.skipIf(!up)('guest orders', () => {
  let manager: TestStaff;
  let waiter: TestStaff;
  let cashier: TestStaff;
  let menu: Menu;

  const send = (session: string, items: unknown, key = guestKey('order')) =>
    guestRpc('send_guest_order', { p_session_id: session, p_items: items, p_idempotency_key: key });

  const accept = (staff: TestStaff, id: string, covers: number | null = 2, key = testIdemKey('accept')) =>
    appRpc(staff.client, 'accept_guest_order', { p_guest_order_id: id, p_covers: covers, p_idempotency_key: key });

  const inbox = async (staff: TestStaff) => {
    const { data, error } = await appRpc(staff.client, 'guest_inbox');
    if (error) throw new Error(error.message);
    return data as { calls: unknown[]; orders: InboxOrder[] };
  };

  const steak = (): GuestLine => ({ menu_item_id: menu.steak, qty: 2, modifier_ids: [menu.mod.rare, menu.mod.cheese] });

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    waiter = await createStaffOfRole('waiter');
    cashier = await createStaffOfRole('cashier');
    menu = await makeMenu();
    await openFreshDay(manager);
  });

  afterEach(async () => {
    await setVenueSwitches(true, true);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  describe('send_guest_order', () => {
    it('prices on the server, ignores any client price, and stores a clean request', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const { data, error } = await send(s, [
        { ...steak(), price: 1, unit_price: 1, line_total: 1 },
        { menu_item_id: menu.burger, qty: 1, note: 'no onion', price: 0 },
      ]);
      expect(error).toBeNull();
      const r = data as Sent;
      expect(r.status).toBe('pending');
      expect(r.total).toBe(2 * 21000 + 12000);
      expect(r.lines.map((l) => [l.menu_item_id, l.qty, l.unit_price, l.line_total])).toEqual([
        [menu.steak, 2, 21000, 42000],
        [menu.burger, 1, 12000, 12000],
      ]);
      expect(r.lines[0]!.modifiers.map((m) => m.id).sort()).toEqual([menu.mod.rare, menu.mod.cheese].sort());
      expect(r.lines[1]!.note).toBe('no onion');
      const [row] = await sql<{ items: unknown; quoted_total: string; status: string; venue_ok: boolean }>(
        `select items, quoted_total, status::text as status,
                venue_id = (select id from venues limit 1) as venue_ok
           from guest_orders where id = $1`,
        [r.guest_order_id],
      );
      expect(row).toMatchObject({ quoted_total: '54000', status: 'pending', venue_ok: true });
      expect(row!.items).toEqual([
        { menu_item_id: menu.steak, qty: 2, modifier_ids: [menu.mod.rare, menu.mod.cheese], note: null },
        { menu_item_id: menu.burger, qty: 1, modifier_ids: [], note: 'no onion' },
      ]);
    });

    it('writes nothing to tabs, orders, order lines or stock', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const before = await stockMovementCount();
      await sendOrder(s, [{ menu_item_id: menu.burger, qty: 3 }]);
      expect(await serviceRowsFor(table)).toEqual({ tabs: 0, orders: 0, lines: 0 });
      expect(await stockMovementCount()).toBe(before);
    });

    it('replays by idempotency key, and needs a key', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const key = guestKey('order');
      const first = await send(s, [{ menu_item_id: menu.tea, qty: 1 }], key);
      const again = await send(s, [{ menu_item_id: menu.tea, qty: 5 }], key);
      expect(again.error).toBeNull();
      expect(again.data).toEqual(first.data);
      expect(await sql(`select id from guest_orders where table_id = $1`, [table])).toHaveLength(1);
      expect((await send(s, [{ menu_item_id: menu.tea, qty: 1 }], ' ')).error?.message).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('validates lines, quantities, items and modifiers like add_items', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const cases: [unknown, string][] = [
        [[], 'ITEMS_REQUIRED'],
        [null, 'ITEMS_REQUIRED'],
        [{ menu_item_id: menu.tea, qty: 1 }, 'ITEMS_REQUIRED'],
        [Array.from({ length: 41 }, () => ({ menu_item_id: menu.tea, qty: 1 })), 'TOO_MANY_ITEMS'],
        [[{ menu_item_id: menu.tea, qty: 0 }], 'INVALID_QTY'],
        [[{ menu_item_id: menu.tea, qty: 21 }], 'INVALID_QTY'],
        [[{ menu_item_id: menu.tea, qty: 1.5 }], 'INVALID_QTY'],
        [[{ menu_item_id: menu.tea, qty: '2' }], 'INVALID_QTY'],
        [[{ menu_item_id: menu.tea }], 'INVALID_QTY'],
        [[{ menu_item_id: menu.soup, qty: 1 }], 'ITEM_NOT_AVAILABLE'],
        [[{ menu_item_id: 'not-a-uuid', qty: 1 }], 'ITEM_NOT_AVAILABLE'],
        [[{ menu_item_id: NO_ROW, qty: 1 }], 'ITEM_NOT_AVAILABLE'],
        [[{ menu_item_id: menu.steak, qty: 1, modifier_ids: [menu.mod.rare, menu.mod.foreign] }], 'MODIFIER_NOT_ALLOWED'],
        [[{ menu_item_id: menu.steak, qty: 1, modifier_ids: [menu.mod.rare, menu.mod.egg] }], 'MODIFIER_NOT_ALLOWED'],
        [[{ menu_item_id: menu.steak, qty: 1, modifier_ids: [menu.mod.rare, menu.mod.rare] }], 'MODIFIER_NOT_ALLOWED'],
        [[{ menu_item_id: menu.steak, qty: 1, modifier_ids: ['junk'] }], 'MODIFIER_NOT_ALLOWED'],
        [[{ menu_item_id: menu.steak, qty: 1, modifier_ids: 'x' }], 'MODIFIER_NOT_ALLOWED'],
        [[{ menu_item_id: menu.steak, qty: 1 }], 'MODIFIER_SELECTION_INVALID'],
        [
          [{ menu_item_id: menu.steak, qty: 1, modifier_ids: [menu.mod.rare, menu.mod.wellDone] }],
          'MODIFIER_SELECTION_INVALID',
        ],
      ];
      for (const [items, code] of cases) {
        const { error } = await send(s, items);
        expect(error?.message, JSON.stringify(items).slice(0, 120)).toBe(code);
      }
      expect(await sql(`select id from guest_orders where table_id = $1`, [table])).toHaveLength(0);
    });

    it('accepts the limits exactly: 40 lines and qty 20', async () => {
      const s = await openSession(await makeTable());
      const forty = await send(s, Array.from({ length: 40 }, () => ({ menu_item_id: menu.tea, qty: 1 })));
      expect(forty.error).toBeNull();
      expect((forty.data as Sent).lines).toHaveLength(40);
      const twenty = await send(s, [{ menu_item_id: menu.tea, qty: 20 }]);
      expect(twenty.error).toBeNull();
      expect((twenty.data as Sent).total).toBe(30000);
    });

    it('cleans notes: control and bidi characters out, whitespace collapsed, 140 characters', async () => {
      const s = await openSession(await makeTable());
      const r = await sendOrder(s, [
        { menu_item_id: menu.tea, qty: 1, note: '  no\u0007 sugar‮\n\n\tplease⁦  ' },
        { menu_item_id: menu.tea, qty: 1, note: 'x'.repeat(300) },
        { menu_item_id: menu.tea, qty: 1, note: ' ‏\n ' },
        { menu_item_id: menu.tea, qty: 1, note: 42 as unknown as string },
        { menu_item_id: menu.tea, qty: 1, note: 'بدون سكر' },
      ]);
      const notes = (r.lines as Line[]).map((l) => l.note);
      expect(notes).toEqual(['no sugar please', 'x'.repeat(140), null, null, 'بدون سكر']);
    });

    it('a table holds at most 3 pending orders', async () => {
      const table = await makeTable();
      const s1 = await openSession(table);
      const s2 = await openSession(table);
      await sendOrder(s1, [{ menu_item_id: menu.tea, qty: 1 }]);
      await sendOrder(s1, [{ menu_item_id: menu.tea, qty: 1 }]);
      const third = await sendOrder(s2, [{ menu_item_id: menu.tea, qty: 1 }]);
      expect((await send(s2, [{ menu_item_id: menu.tea, qty: 1 }])).error?.message).toBe('TOO_MANY_PENDING_ORDERS');
      // A decided order frees a place.
      expect((await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: third.guest_order_id })).error).toBeNull();
      expect((await send(s2, [{ menu_item_id: menu.tea, qty: 1 }])).error).toBeNull();
    });

    it('GUEST_ORDERS_OFF when the venue or the table switch is off', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      await setVenueSwitches(true, false);
      expect((await send(s, [{ menu_item_id: menu.tea, qty: 1 }])).error?.message).toBe('GUEST_ORDERS_OFF');
      await setVenueSwitches(false, true); // calls off does not stop ordering
      await sql(`update table_links set guest_enabled = false where table_id = $1`, [table]);
      expect((await send(s, [{ menu_item_id: menu.tea, qty: 1 }])).error?.message).toBe('GUEST_ORDERS_OFF');
      await sql(`update table_links set guest_enabled = true where table_id = $1`, [table]);
      expect((await send(s, [{ menu_item_id: menu.tea, qty: 1 }])).error).toBeNull();
    });

    it('the switch is checked before validation', async () => {
      const s = await openSession(await makeTable());
      await setVenueSwitches(true, false);
      expect((await send(s, [])).error?.message).toBe('GUEST_ORDERS_OFF');
    });

    it('a second session of the same table cannot see the first session’s orders', async () => {
      const table = await makeTable();
      const s1 = await openSession(table);
      const s2 = await openSession(table);
      const mine = await sendOrder(s1, [{ menu_item_id: menu.burger, qty: 1 }]);
      const status = async (s: string) =>
        ((await guestRpc('guest_status', { p_session_id: s })).data as { orders: { id: string }[] }).orders;
      expect((await status(s1)).map((o) => o.id)).toEqual([mine.guest_order_id]);
      expect(await status(s2)).toEqual([]);
    });
  });

  describe('accept_guest_order', () => {
    it('on a free table: covers are required, then a tab opens and the lines land, as the staff member', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const sent = await sendOrder(s, [steak(), { menu_item_id: menu.burger, qty: 1, note: 'well done' }]);

      expect((await accept(waiter, sent.guest_order_id, null)).error?.message).toBe('COVERS_REQUIRED');
      expect(await serviceRowsFor(table)).toEqual({ tabs: 0, orders: 0, lines: 0 });

      const { data, error } = await accept(waiter, sent.guest_order_id, 3);
      expect(error).toBeNull();
      const r = data as Accepted;
      expect(r).toMatchObject({ guest_order_id: sent.guest_order_id, status: 'accepted', already: false });
      expect(r.totals.total).toBe(54000);
      const [tab] = await sql(`select id, waiter_id, covers, status::text as status from tabs where table_id = $1`, [table]);
      expect(tab).toEqual({ id: r.tab_id, waiter_id: waiter.id, covers: 3, status: 'open' });
      const lines = await sql(
        `select menu_item_id, qty, unit_price::int as unit_price, note from order_items where order_id = $1 order by created_at, unit_price desc`,
        [r.order_id],
      );
      expect(lines).toHaveLength(2);
      expect(lines).toContainEqual({ menu_item_id: menu.steak, qty: 2, unit_price: 21000, note: null });
      expect(lines).toContainEqual({ menu_item_id: menu.burger, qty: 1, unit_price: 12000, note: 'well done' });
      const [go] = await sql(
        `select status::text as status, tab_id, order_id, decided_by, decided_at is not null as decided
           from guest_orders where id = $1`,
        [sent.guest_order_id],
      );
      expect(go).toEqual({ status: 'accepted', tab_id: r.tab_id, order_id: r.order_id, decided_by: waiter.id, decided: true });
      const audit = await sql(`select actor_id from audit_log where action = 'guest_order.accept' and entity_id = $1`, [
        sent.guest_order_id,
      ]);
      expect(audit).toEqual([{ actor_id: waiter.id }]);
      // The guest sees it.
      const st = (await guestRpc('guest_status', { p_session_id: s })).data as { orders: { id: string; status: string }[] };
      expect(st.orders[0]).toMatchObject({ id: sent.guest_order_id, status: 'accepted' });
    });

    it('on a table with an open tab: the lines join that tab and covers are not needed', async () => {
      const table = await makeTable();
      const opened = await appRpc(waiter.client, 'open_tab', {
        p_table_id: table,
        p_covers: 2,
        p_idempotency_key: testIdemKey('tab'),
      });
      const tabId = (opened.data as { tab_id: string }).tab_id;
      const s = await openSession(table);
      const sent = await sendOrder(s, [{ menu_item_id: menu.tea, qty: 2 }]);
      const inboxRow = (await inbox(cashier)).orders.find((o) => o.id === sent.guest_order_id);
      expect(inboxRow?.table_has_tab).toBe(true);
      const { data, error } = await accept(cashier, sent.guest_order_id, null);
      expect(error).toBeNull();
      expect((data as Accepted).tab_id).toBe(tabId);
      expect(await serviceRowsFor(table)).toEqual({ tabs: 1, orders: 1, lines: 1 });
    });

    it('stock moves only at accept', async () => {
      const [ing] = await sql<{ id: string }>(
        `insert into ingredients (name_en, name_ar, unit, cost_per_unit) values ('Guest beef', 'لحم', 'g', 1) returning id`,
      );
      await sql(`insert into recipe_lines (menu_item_id, ingredient_id, qty) values ($1, $2, 150)`, [menu.burger, ing!.id]);
      // Opening stock, so the row this test leaves behind never reads as out of stock (seed.test.ts).
      await sql(`insert into stock_movements (ingredient_id, kind, qty, unit_cost) values ($1, 'delivery', 1000, 1)`, [ing!.id]);
      const moved = async () =>
        Number(
          (await sql<{ q: string }>(`select coalesce(sum(qty), 0) as q from stock_movements where ingredient_id = $1`, [ing!.id]))[0]!.q,
        );
      const s = await openSession(await makeTable());
      const sent = await sendOrder(s, [{ menu_item_id: menu.burger, qty: 2 }]);
      expect(await moved()).toBe(1000);
      expect((await accept(waiter, sent.guest_order_id)).error).toBeNull();
      expect(await moved()).toBe(700);
      await sql(`delete from recipe_lines where ingredient_id = $1`, [ing!.id]);
    });

    it('a double tap with the same key replays; another key returns already: true; one order either way', async () => {
      const table = await makeTable();
      const sent = await sendOrder(await openSession(table), [{ menu_item_id: menu.tea, qty: 1 }]);
      const key = testIdemKey('accept');
      const first = await accept(waiter, sent.guest_order_id, 2, key);
      const replay = await accept(waiter, sent.guest_order_id, 2, key);
      expect(replay.error).toBeNull();
      expect(replay.data).toEqual(first.data);
      const other = await accept(manager, sent.guest_order_id, 2);
      expect(other.error).toBeNull();
      const o = other.data as Accepted;
      const f = first.data as Accepted;
      expect(o).toMatchObject({ already: true, status: 'accepted', tab_id: f.tab_id, order_id: f.order_id });
      expect(await serviceRowsFor(table)).toEqual({ tabs: 1, orders: 1, lines: 1 });
    });

    it('two staff accepting the same order at once: both succeed, one order', async () => {
      const table = await makeTable();
      const sent = await sendOrder(await openSession(table), [{ menu_item_id: menu.burger, qty: 1 }]);
      const [a, b] = await Promise.all([accept(waiter, sent.guest_order_id), accept(manager, sent.guest_order_id)]);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect([(a.data as Accepted).already, (b.data as Accepted).already].sort()).toEqual([false, true]);
      expect(await serviceRowsFor(table)).toEqual({ tabs: 1, orders: 1, lines: 1 });
    });

    it('two different orders for one free table accepted at once land on one tab', async () => {
      const table = await makeTable();
      const g1 = await sendOrder(await openSession(table), [{ menu_item_id: menu.burger, qty: 1 }]);
      const g2 = await sendOrder(await openSession(table), [{ menu_item_id: menu.tea, qty: 1 }]);
      const [a, b] = await Promise.all([accept(waiter, g1.guest_order_id, 2), accept(cashier, g2.guest_order_id, 4)]);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect((a.data as Accepted).tab_id).toBe((b.data as Accepted).tab_id);
      expect(await serviceRowsFor(table)).toEqual({ tabs: 1, orders: 2, lines: 2 });
    });

    it('accepts at today’s menu price; the inbox shows the change first', async () => {
      const own = await makeMenu();
      const table = await makeTable();
      const sent = await sendOrder(await openSession(table), [{ menu_item_id: own.burger, qty: 2 }]);
      expect(sent.total).toBe(24000);
      let row = (await inbox(waiter)).orders.find((o) => o.id === sent.guest_order_id)!;
      expect(row).toMatchObject({ total: 24000, current_total: 24000, price_changed: false, unavailable: false });
      await sql(`update menu_items set price = 13000 where id = $1`, [own.burger]);
      row = (await inbox(waiter)).orders.find((o) => o.id === sent.guest_order_id)!;
      expect(row).toMatchObject({ total: 24000, current_total: 26000, price_changed: true, unavailable: false });
      const r = (await accept(waiter, sent.guest_order_id)).data as Accepted;
      expect(r.totals.total).toBe(26000);
    });

    it('an item deactivated before accept: accept fails and writes nothing; the inbox says unavailable', async () => {
      const own = await makeMenu();
      const table = await makeTable();
      const sent = await sendOrder(await openSession(table), [{ menu_item_id: own.tea, qty: 1 }]);
      await sql(`update menu_items set is_active = false where id = $1`, [own.tea]);
      const row = (await inbox(waiter)).orders.find((o) => o.id === sent.guest_order_id)!;
      expect(row).toMatchObject({ unavailable: true, current_total: null });
      const { error } = await accept(waiter, sent.guest_order_id);
      expect(error?.message).toBe('ITEM_NOT_AVAILABLE');
      expect(await serviceRowsFor(table)).toEqual({ tabs: 0, orders: 0, lines: 0 });
      const [go] = await sql(`select status::text as status, tab_id from guest_orders where id = $1`, [sent.guest_order_id]);
      expect(go).toEqual({ status: 'pending', tab_id: null });
      expect((await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: sent.guest_order_id })).error).toBeNull();
    });

    it('an unknown order is GUEST_ORDER_NOT_FOUND', async () => {
      expect((await accept(waiter, NO_ROW)).error?.message).toBe('GUEST_ORDER_NOT_FOUND');
    });
  });

  describe('decline_guest_order', () => {
    it('pending to declined, audited; again is already: true; accepted and declined cannot cross', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const g = await sendOrder(s, [{ menu_item_id: menu.tea, qty: 1 }]);
      const first = await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: g.guest_order_id });
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({ guest_order_id: g.guest_order_id, status: 'declined', already: false });
      const again = await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: g.guest_order_id });
      expect(again.data).toMatchObject({ already: true });
      expect((await accept(waiter, g.guest_order_id)).error?.message).toBe('GUEST_ORDER_NOT_PENDING');
      expect(await serviceRowsFor(table)).toEqual({ tabs: 0, orders: 0, lines: 0 });
      expect(
        await sql(`select actor_id from audit_log where action = 'guest_order.decline' and entity_id = $1`, [g.guest_order_id]),
      ).toEqual([{ actor_id: waiter.id }]);
      const st = (await guestRpc('guest_status', { p_session_id: s })).data as { orders: { status: string }[] };
      expect(st.orders[0]!.status).toBe('declined');

      const g2 = await sendOrder(s, [{ menu_item_id: menu.tea, qty: 1 }]);
      expect((await accept(waiter, g2.guest_order_id)).error).toBeNull();
      expect((await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: g2.guest_order_id })).error?.message).toBe(
        'GUEST_ORDER_NOT_PENDING',
      );
      expect((await appRpc(waiter.client, 'decline_guest_order', { p_guest_order_id: NO_ROW })).error?.message).toBe(
        'GUEST_ORDER_NOT_FOUND',
      );
    });
  });

  describe('guest_inbox', () => {
    it('lists pending orders of the open day, oldest first, with lines, totals and the table', async () => {
      const table = await makeTable();
      const g1 = await sendOrder(await openSession(table), [{ menu_item_id: menu.burger, qty: 1 }]);
      const g2 = await sendOrder(await openSession(table), [steak()]);
      const rows = (await inbox(manager)).orders;
      const mine = rows.filter((o) => [g1.guest_order_id, g2.guest_order_id].includes(o.id));
      expect(mine.map((o) => o.id)).toEqual([g1.guest_order_id, g2.guest_order_id]);
      const [label] = await sql<{ label: string }>(`select label from dining_tables where id = $1`, [table]);
      expect(mine[1]).toMatchObject({
        table_id: table,
        table_label: label!.label,
        total: 42000,
        current_total: 42000,
        price_changed: false,
        unavailable: false,
        table_has_tab: false,
      });
      expect(mine[1]!.lines[0]).toMatchObject({ menu_item_id: menu.steak, qty: 2, unit_price: 21000 });
      const times = rows.map((o) => o.sent_at);
      expect([...times].sort()).toEqual(times);
      await appRpc(manager.client, 'decline_guest_order', { p_guest_order_id: g1.guest_order_id });
      expect((await inbox(manager)).orders.map((o) => o.id)).not.toContain(g1.guest_order_id);
    });
  });

  describe('after the business day closed', () => {
    it('sending is DAY_NOT_OPEN; accepting an old pending order is GUEST_ORDER_EXPIRED; the guest sees expired', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const g = await sendOrder(s, [{ menu_item_id: menu.tea, qty: 1 }]);
      await closeDayDirectly();
      try {
        expect((await send(s, [{ menu_item_id: menu.tea, qty: 1 }])).error?.message).toBe('DAY_NOT_OPEN');
        expect((await accept(waiter, g.guest_order_id)).error?.message).toBe('GUEST_ORDER_EXPIRED');
        const st = (await guestRpc('guest_status', { p_session_id: s })).data as { orders: { status: string }[] };
        expect(st.orders[0]!.status).toBe('expired');
        await openFreshDay(manager);
        // A new day does not revive yesterday's order.
        expect((await accept(waiter, g.guest_order_id)).error?.message).toBe('GUEST_ORDER_EXPIRED');
        expect((await inbox(waiter)).orders.map((o) => o.id)).not.toContain(g.guest_order_id);
        expect(await serviceRowsFor(table)).toEqual({ tabs: 0, orders: 0, lines: 0 });
      } finally {
        if (!(await sql(`select 1 from day_sessions where closed_at is null`)).length) await openFreshDay(manager);
      }
    });
  });
});
