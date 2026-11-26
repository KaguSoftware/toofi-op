/**
 * Guest QR menu, part 4: the manager and owner tools (table_qr_tokens,
 * set_table_guest_enabled, set_guest_service, rotate_table_token audit) and the
 * realtime refetch signals of waiter_calls and guest_orders. Role gates are in
 * rls-matrix.ts.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  VENUE_ID,
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';
import { makeMenu, makeTable, openFreshDay, type Menu } from './money-fixtures';
import { guestKey, guestRpc, openSession, sendOrder, setVenueSwitches, tokenOf } from './guest-fixtures';

const up = await stackAvailable();

interface QrRow {
  table_id: string;
  label: string;
  area_id: string;
  token: string;
  guest_enabled: boolean;
}

describe.skipIf(!up)('guest admin tools and realtime', () => {
  let manager: TestStaff;
  let owner: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    owner = await createStaffOfRole('owner');
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

  it('table_qr_tokens lists active tables with their tokens, and audits each call without a token', async () => {
    const live = await makeTable();
    const gone = await makeTable();
    await sql(`update dining_tables set is_active = false where id = $1`, [gone]);
    const { data, error } = await appRpc(manager.client, 'table_qr_tokens');
    expect(error).toBeNull();
    const rows = data as QrRow[];
    const mine = rows.find((r) => r.table_id === live);
    expect(mine).toMatchObject({ token: await tokenOf(live), guest_enabled: true });
    expect(rows.map((r) => r.table_id)).not.toContain(gone);
    const [audit] = await sql<{ actor_id: string; after: unknown }>(
      `select actor_id, after from audit_log where action = 'table_link.read_tokens' order by created_at desc limit 1`,
    );
    expect(audit!.actor_id).toBe(manager.id);
    expect(JSON.stringify(audit!.after)).not.toContain(mine!.token);
  });

  it('set_table_guest_enabled turns one table off and on, audited', async () => {
    const table = await makeTable();
    const off = await appRpc(manager.client, 'set_table_guest_enabled', { p_table_id: table, p_enabled: false });
    expect(off.error).toBeNull();
    expect(off.data).toEqual({ table_id: table, guest_enabled: false });
    const s = await openSession(table);
    const call = await guestRpc('raise_waiter_call', { p_session_id: s, p_reason: 'water', p_idempotency_key: guestKey('call') });
    expect(call.error?.message).toBe('GUEST_CALLS_OFF');
    await appRpc(manager.client, 'set_table_guest_enabled', { p_table_id: table, p_enabled: true });
    expect(
      (await guestRpc('raise_waiter_call', { p_session_id: s, p_reason: 'water', p_idempotency_key: guestKey('call') })).error,
    ).toBeNull();
    const audits = await sql<{ after: { guest_enabled: boolean } }>(
      `select a.after from audit_log a join table_links l on l.id = a.entity_id
        where a.action = 'table_link.set_guest_enabled' and l.table_id = $1 order by a.created_at`,
      [table],
    );
    expect(audits.map((a) => a.after.guest_enabled)).toEqual([false, true]);
    const missing = await appRpc(manager.client, 'set_table_guest_enabled', { p_table_id: table, p_enabled: null });
    expect(missing.error?.message).toBe('ACTIVE_FLAG_REQUIRED');
  });

  it('set_guest_service writes the two venue switches, audited', async () => {
    const { data, error } = await appRpc(manager.client, 'set_guest_service', {
      p_calls_enabled: false,
      p_orders_enabled: true,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ calls_enabled: false, orders_enabled: true });
    expect(await sql(`select guest_calls_enabled, guest_orders_enabled from venue_settings`)).toEqual([
      { guest_calls_enabled: false, guest_orders_enabled: true },
    ]);
    const [audit] = await sql<{ actor_id: string; after: unknown }>(
      `select actor_id, after from audit_log where action = 'venue_settings.guest_service' order by created_at desc limit 1`,
    );
    expect(audit).toEqual({ actor_id: manager.id, after: { guest_calls_enabled: false, guest_orders_enabled: true } });
    // The new columns are readable by staff with the rest of venue_settings.
    const read = await manager.client.from('venue_settings').select('guest_calls_enabled, guest_orders_enabled');
    expect(read.data).toEqual([{ guest_calls_enabled: false, guest_orders_enabled: true }]);
  });

  it('rotate_table_token is audited without the token', async () => {
    const table = await makeTable();
    const oldToken = await tokenOf(table);
    const { error } = await appRpc(owner.client, 'rotate_table_token', { p_table_id: table });
    expect(error).toBeNull();
    const [audit] = await sql<{ actor_id: string; before: unknown; after: unknown }>(
      `select a.actor_id, a.before, a.after from audit_log a join table_links l on l.id = a.entity_id
        where a.action = 'table_link.rotate' and l.table_id = $1`,
      [table],
    );
    expect(audit!.actor_id).toBe(owner.id);
    const text = JSON.stringify(audit);
    expect(text).not.toContain(oldToken);
    expect(text).not.toContain(await tokenOf(table));
  });

  it('waiter_calls and guest_orders send the refetch signal on tabs:<venue>', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    const call = await guestRpc('raise_waiter_call', { p_session_id: s, p_reason: 'bill', p_idempotency_key: guestKey('call') });
    const callId = (call.data as { call_id: string }).call_id;
    const order = await sendOrder(s, [{ menu_item_id: menu.tea, qty: 1 }]);
    await appRpc(manager.client, 'answer_waiter_call', { p_call_id: callId });
    const rows = await sql<{ payload: { table: string; id: string } }>(
      `select payload from realtime.messages where topic = $1 and payload ->> 'id' in ($2, $3) order by inserted_at, id`,
      [`tabs:${VENUE_ID}`, callId, order.guest_order_id],
    );
    expect(rows.map((r) => r.payload)).toEqual([
      { table: 'waiter_calls', id: callId },
      { table: 'guest_orders', id: order.guest_order_id },
      { table: 'waiter_calls', id: callId },
    ]);
  });
});
