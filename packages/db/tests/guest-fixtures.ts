/**
 * Fixtures for the guest QR menu tests: a table's link token (read as the
 * superuser, since no client can select it), a guest table session opened through
 * the anon key exactly as the guest site's server does, and guest RPC calls.
 * Not a test file.
 */
import { anonClient, appRpc, sql, testIdemKey } from './helpers';

/** Call a guest function with the anon key (no staff login). */
export function guestRpc(fn: string, args: Record<string, unknown> = {}) {
  return appRpc(anonClient(), fn, args);
}

/** The current link token of a table. */
export async function tokenOf(tableId: string): Promise<string> {
  const [row] = await sql<{ token: string }>(`select token from table_links where table_id = $1`, [tableId]);
  if (!row) throw new Error(`no table link for ${tableId}`);
  return row.token;
}

export interface OpenedSession {
  session_id: string;
  table_label: string;
  expires_at: string;
  calls_enabled: boolean;
  orders_enabled: boolean;
  day_open: boolean;
}

/** Open a guest table session on a table; returns the session id. */
export async function openSession(tableId: string): Promise<string> {
  const { data, error } = await guestRpc('open_table_session', { p_token: await tokenOf(tableId) });
  if (error) throw new Error(`open_table_session failed: ${error.message}`);
  return (data as OpenedSession).session_id;
}

export function guestKey(type: string): string {
  return testIdemKey(`guest_${type}`);
}

export interface GuestLine {
  menu_item_id: string;
  qty: number;
  modifier_ids?: string[];
  note?: string;
  [k: string]: unknown;
}

/** Send a guest order; throws on error, returns the result. */
export async function sendOrder(sessionId: string, items: GuestLine[]) {
  const { data, error } = await guestRpc('send_guest_order', {
    p_session_id: sessionId,
    p_items: items,
    p_idempotency_key: guestKey('order'),
  });
  if (error) throw new Error(`send_guest_order failed: ${error.message}`);
  return data as { guest_order_id: string; status: string; lines: unknown[]; total: number; sent_at: string };
}

/** Set the venue's two guest switches directly (tests restore them in afterEach). */
export async function setVenueSwitches(calls: boolean, orders: boolean): Promise<void> {
  await sql(`update venue_settings set guest_calls_enabled = $1, guest_orders_enabled = $2`, [calls, orders]);
}

/** Close the open business day directly (as openFreshDay does), leaving no open day. */
export async function closeDayDirectly(): Promise<void> {
  await sql(`update tabs set status = 'void', closed_at = now() where status = 'open'`);
  await sql(`update day_sessions set closed_at = now(), closed_by = opened_by where closed_at is null`);
}

/** Rows of the money and stock tables that belong to a table (for "nothing written" checks). */
export async function serviceRowsFor(tableId: string): Promise<{ tabs: number; orders: number; lines: number }> {
  const [row] = await sql<{ tabs: string; orders: string; lines: string }>(
    `select (select count(*) from tabs t where t.table_id = $1) as tabs,
            (select count(*) from orders o join tabs t on t.id = o.tab_id where t.table_id = $1) as orders,
            (select count(*) from order_items oi join tabs t on t.id = oi.tab_id where t.table_id = $1) as lines`,
    [tableId],
  );
  return { tabs: Number(row!.tabs), orders: Number(row!.orders), lines: Number(row!.lines) };
}

export async function stockMovementCount(): Promise<number> {
  const [row] = await sql<{ n: string }>(`select count(*) as n from stock_movements`);
  return Number(row!.n);
}
