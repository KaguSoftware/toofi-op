/**
 * Tabs and orders: open_tab, add_items (server pricing and validation), transfer,
 * merge, cancel and void, with idempotent replay and the manager PIN gate.
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
import { NO_ROW } from './rls-matrix';
import { addItems, grantPin, makeMenu, makeTable, openFreshDay, openTab, totals, type Menu } from './money-fixtures';

const up = await stackAvailable();
const PIN = uniquePin();

describe.skipIf(!up)('tabs and orders', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let waiter: TestStaff;
  let otherWaiter: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager', PIN);
    cashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    otherWaiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    await openFreshDay(manager);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  describe('open_tab', () => {
    it('opens a tab for the caller on a free table, and replays its key', async () => {
      const table = await makeTable();
      const args = { p_table_id: table, p_covers: 4, p_idempotency_key: testIdemKey('tab') };
      const first = await appRpc(waiter.client, 'open_tab', args);
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({ table_id: table, covers: 4, status: 'open' });
      const again = await appRpc(waiter.client, 'open_tab', args);
      expect(again.data).toEqual(first.data);
      const rows = await sql(`select waiter_id from tabs where table_id = $1`, [table]);
      expect(rows).toEqual([{ waiter_id: waiter.id }]);
    });

    it('refuses a second open tab on the same table', async () => {
      const table = await makeTable();
      const open = (key: string) =>
        appRpc(waiter.client, 'open_tab', { p_table_id: table, p_covers: 2, p_idempotency_key: key });
      expect((await open(testIdemKey('tab'))).error).toBeNull();
      expect((await open(testIdemKey('tab'))).error?.message).toBe('TABLE_OCCUPIED');
    });

    it('validates covers and the table', async () => {
      const bad = await appRpc(waiter.client, 'open_tab', {
        p_table_id: await makeTable(),
        p_covers: 0,
        p_idempotency_key: testIdemKey('tab'),
      });
      expect(bad.error?.message).toBe('INVALID_COVERS');
      const none = await appRpc(waiter.client, 'open_tab', {
        p_table_id: NO_ROW,
        p_covers: 1,
        p_idempotency_key: testIdemKey('tab'),
      });
      expect(none.error?.message).toBe('TABLE_NOT_FOUND');
    });
  });

  describe('add_items', () => {
    it('prices every line on the server, with modifier deltas and snapshots', async () => {
      const tab = await openTab(waiter);
      const { data, error } = await appRpc(waiter.client, 'add_items', {
        p_tab_id: tab,
        p_items: [
          {
            menu_item_id: menu.steak,
            qty: 2,
            modifier_ids: [menu.mod.rare, menu.mod.cheese, menu.mod.bacon],
            note: 'no salt',
            unit_price: 1, // ignored: the client never prices
          },
          { menu_item_id: menu.tea, qty: 1 },
        ],
        p_idempotency_key: testIdemKey('order'),
      });
      expect(error).toBeNull();
      const out = data as { order_id: string; lines: { id: string }[]; totals: { subtotal: number } };
      expect(out.totals.subtotal).toBe(46500);
      const lines = await sql(
        `select name_en, unit_price::int, qty, line_total::int, tax_rate_bps, note
           from order_items where order_id = $1 order by line_total desc`,
        [out.order_id],
      );
      expect(lines).toEqual([
        { name_en: 'Steak', unit_price: 22500, qty: 2, line_total: 45000, tax_rate_bps: 1000, note: 'no salt' },
        { name_en: 'Tea', unit_price: 1500, qty: 1, line_total: 1500, tax_rate_bps: 0, note: null },
      ]);
      const mods = await sql(
        `select name_en, price_delta::int from order_item_modifiers where order_item_id = $1 order by name_en`,
        [out.lines[0]!.id],
      );
      expect(mods).toEqual([
        { name_en: 'Bacon', price_delta: 1500 },
        { name_en: 'Cheese', price_delta: 1000 },
        { name_en: 'Rare', price_delta: 0 },
      ]);
    });

    it('replays its key without a second order', async () => {
      const tab = await openTab(waiter);
      const args = {
        p_tab_id: tab,
        p_items: [{ menu_item_id: menu.burger, qty: 1 }],
        p_idempotency_key: testIdemKey('order'),
      };
      const first = await appRpc(waiter.client, 'add_items', args);
      const again = await appRpc(waiter.client, 'add_items', args);
      expect(again.data).toEqual(first.data);
      expect(await sql(`select 1 from orders where tab_id = $1`, [tab])).toHaveLength(1);
    });

    it('refuses invalid items', async () => {
      const tab = await openTab(waiter);
      const send = async (items: unknown) =>
        (await appRpc(waiter.client, 'add_items', { p_tab_id: tab, p_items: items, p_idempotency_key: testIdemKey('o') }))
          .error?.message;
      expect(await send([])).toBe('ITEMS_REQUIRED');
      expect(await send([{ menu_item_id: menu.soup, qty: 1 }])).toBe('ITEM_NOT_AVAILABLE');
      expect(await send([{ menu_item_id: NO_ROW, qty: 1 }])).toBe('ITEM_NOT_AVAILABLE');
      expect(await send([{ menu_item_id: menu.tea, qty: 0 }])).toBe('INVALID_QTY');
      const steak = (mods: string[]) => [{ menu_item_id: menu.steak, qty: 1, modifier_ids: mods }];
      expect(await send(steak([menu.mod.rare, menu.mod.egg]))).toBe('MODIFIER_NOT_ALLOWED');
      expect(await send(steak([menu.mod.rare, menu.mod.foreign]))).toBe('MODIFIER_NOT_ALLOWED');
      expect(await send(steak([]))).toBe('MODIFIER_SELECTION_INVALID');
      expect(await send(steak([menu.mod.rare, menu.mod.wellDone]))).toBe('MODIFIER_SELECTION_INVALID');
      expect(await sql(`select 1 from orders where tab_id = $1`, [tab])).toHaveLength(0);
    });

    it('refuses a tab that is not open', async () => {
      const tab = await openTab(waiter);
      await appRpc(waiter.client, 'cancel_tab', { p_tab_id: tab, p_reason: 'left' });
      const { error } = await appRpc(waiter.client, 'add_items', {
        p_tab_id: tab,
        p_items: [{ menu_item_id: menu.tea, qty: 1 }],
        p_idempotency_key: testIdemKey('order'),
      });
      expect(error?.message).toBe('TAB_NOT_OPEN');
    });
  });

  describe('transfer_tab', () => {
    it('moves a tab to a free table, never to an occupied one', async () => {
      const tab = await openTab(waiter);
      const free = await makeTable();
      expect((await appRpc(waiter.client, 'transfer_tab', { p_tab_id: tab, p_table_id: free })).error).toBeNull();
      expect(await sql(`select table_id from tabs where id = $1`, [tab])).toEqual([{ table_id: free }]);

      const other = await openTab(waiter);
      const [{ table_id: taken } = { table_id: '' }] = await sql<{ table_id: string }>(
        `select table_id from tabs where id = $1`,
        [other],
      );
      const { error } = await appRpc(waiter.client, 'transfer_tab', { p_tab_id: tab, p_table_id: taken });
      expect(error?.message).toBe('TABLE_OCCUPIED');
    });

    it('a waiter moves only their own tabs; a cashier moves any', async () => {
      const tab = await openTab(waiter);
      const t = await makeTable();
      const { error } = await appRpc(otherWaiter.client, 'transfer_tab', { p_tab_id: tab, p_table_id: t });
      expect(error?.message).toBe('NOT_YOUR_TAB');
      expect((await appRpc(cashier.client, 'transfer_tab', { p_tab_id: tab, p_table_id: t })).error).toBeNull();
    });
  });

  describe('merge_tabs', () => {
    it('moves lines into the target, adds covers and voids the source', async () => {
      const from = await openTab(waiter, 2);
      const into = await openTab(waiter, 3);
      await addItems(waiter, from, [{ menu_item_id: menu.burger, qty: 1 }]);
      await addItems(waiter, into, [{ menu_item_id: menu.tea, qty: 1 }]);

      const { data, error } = await appRpc(waiter.client, 'merge_tabs', { p_from: from, p_into: into });
      expect(error).toBeNull();
      expect(data).toMatchObject({ from_tab_id: from, into_tab_id: into, totals: { subtotal: 13500 } });
      const [src] = await sql(`select status, merged_into_tab_id, closed_at is not null as closed from tabs where id = $1`, [
        from,
      ]);
      expect(src).toEqual({ status: 'void', merged_into_tab_id: into, closed: true });
      expect(await sql(`select covers from tabs where id = $1`, [into])).toEqual([{ covers: 5 }]);
      expect((await totals(waiter, into)).total).toBe(13500);
      expect((await totals(waiter, from)).total).toBe(0);
    });

    it('refuses merging a tab into itself or a source with payments', async () => {
      const a = await openTab(waiter);
      const b = await openTab(waiter);
      expect((await appRpc(waiter.client, 'merge_tabs', { p_from: a, p_into: a })).error?.message).toBe('MERGE_SELF');
      await addItems(waiter, a, [{ menu_item_id: menu.burger, qty: 1 }]);
      await appRpc(cashier.client, 'settle_tab', {
        p_tab_id: a,
        p_method: 'card',
        p_amount: 1000,
        p_tendered: null,
        p_device_id: 'tabs-test',
        p_idempotency_key: testIdemKey('pay'),
      });
      const { error } = await appRpc(waiter.client, 'merge_tabs', { p_from: a, p_into: b });
      expect(error?.message).toBe('MERGE_SOURCE_HAS_PAYMENTS');
    });
  });

  describe('cancel_tab', () => {
    it('any staff cancels an empty tab', async () => {
      const tab = await openTab(waiter);
      const { data, error } = await appRpc(waiter.client, 'cancel_tab', { p_tab_id: tab, p_reason: 'left' });
      expect(error).toBeNull();
      expect(data).toMatchObject({ tab_id: tab, status: 'void' });
    });

    it('a non-empty tab: waiter refused, cashier needs a PIN, the lines are voided', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
      expect((await appRpc(waiter.client, 'cancel_tab', { p_tab_id: tab, p_reason: 'x' })).error?.message).toBe(
        'FORBIDDEN',
      );
      expect((await appRpc(cashier.client, 'cancel_tab', { p_tab_id: tab, p_reason: 'x' })).error?.message).toBe(
        'PIN_GRANT_REQUIRED',
      );
      await grantPin(cashier, PIN, 'cancel_tab');
      expect((await appRpc(cashier.client, 'cancel_tab', { p_tab_id: tab, p_reason: 'walked out' })).error).toBeNull();
      const lines = await sql(`select voided_by, void_authorized_by from order_items where tab_id = $1`, [tab]);
      expect(lines).toEqual([{ voided_by: cashier.id, void_authorized_by: manager.id }]);
      const [audit] = await sql(
        `select actor_id, authorized_by, reason from audit_log where action = 'tab.cancel' and entity_id = $1`,
        [tab],
      );
      expect(audit).toEqual({ actor_id: cashier.id, authorized_by: manager.id, reason: 'walked out' });
    });

    it('needs a reason', async () => {
      const tab = await openTab(waiter);
      expect((await appRpc(waiter.client, 'cancel_tab', { p_tab_id: tab, p_reason: ' ' })).error?.message).toBe(
        'REASON_REQUIRED',
      );
    });
  });

  describe('void_item', () => {
    it('a waiter needs a manager PIN; the grant works once; the authorizer is recorded', async () => {
      const tab = await openTab(waiter);
      const [burger, tea] = await addItems(waiter, tab, [
        { menu_item_id: menu.burger, qty: 1 },
        { menu_item_id: menu.tea, qty: 1 },
      ]);
      const voidLine = (id: string | undefined) =>
        appRpc(waiter.client, 'void_item', { p_order_item_id: id, p_reason: 'wrong item' });

      expect((await voidLine(burger)).error?.message).toBe('PIN_GRANT_REQUIRED');
      await grantPin(waiter, PIN, 'void_item');
      const ok = await voidLine(burger);
      expect(ok.error).toBeNull();
      expect(ok.data).toMatchObject({ order_item_id: burger, totals: { subtotal: 1500 } });
      expect((await voidLine(tea)).error?.message).toBe('PIN_GRANT_REQUIRED');

      const [line] = await sql(
        `select voided_at is not null as voided, voided_by, void_reason, void_authorized_by from order_items where id = $1`,
        [burger],
      );
      expect(line).toEqual({ voided: true, voided_by: waiter.id, void_reason: 'wrong item', void_authorized_by: manager.id });
      const [audit] = await sql(
        `select actor_id, authorized_by from audit_log where action = 'order_item.void' and entity_id = $1`,
        [burger],
      );
      expect(audit).toEqual({ actor_id: waiter.id, authorized_by: manager.id });
    });

    it('a manager voids without a PIN and is recorded as the authorizer; a line voids once', async () => {
      const tab = await openTab(waiter);
      const [line] = await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
      const v = () => appRpc(manager.client, 'void_item', { p_order_item_id: line, p_reason: 'spilt' });
      expect((await v()).error).toBeNull();
      expect(await sql(`select void_authorized_by from order_items where id = $1`, [line])).toEqual([
        { void_authorized_by: manager.id },
      ]);
      expect((await v()).error?.message).toBe('LINE_ALREADY_VOIDED');
    });
  });
});
