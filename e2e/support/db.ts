/**
 * Database fixtures for the e2e suite. resetDb() returns the local stack to the
 * seed state in about a second: the append-only triggers are bypassed with
 * session_replication_role = replica (superuser), every public and app table is
 * truncated, accounts other than the four demo staff are deleted, and seed.sql
 * is replayed. Also direct-SQL helpers and RPC helpers that sign in as a demo role.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55421';
export const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const PASSWORD = 'demo-pass-123';
export const ROLES = {
  owner: { email: 'owner@demo.local', pin: '482916', name: 'Demo Owner' },
  manager: { email: 'manager@demo.local', pin: '735194', name: 'Demo Manager' },
  cashier: { email: 'cashier@demo.local', pin: '264853', name: 'Demo Cashier' },
  waiter: { email: 'waiter@demo.local', pin: '917352', name: 'Demo Waiter' },
} as const;
export type Role = keyof typeof ROLES;

const SEED = path.resolve(__dirname, '../../packages/db/supabase/seed.sql');

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export async function resetDb(): Promise<void> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query('begin');
    await c.query('set local session_replication_role = replica');
    const { rows } = await c.query<{ t: string }>(
      `select format('%I.%I', table_schema, table_name) as t from information_schema.tables
        where table_schema in ('public', 'app') and table_type = 'BASE TABLE'`,
    );
    await c.query(`truncate ${rows.map((r) => r.t).join(', ')} restart identity cascade`);
    await c.query('commit');
    // Outside the replica transaction, so the foreign keys cascade to identities and sessions.
    await c.query(
      `delete from auth.users where email not in ('owner@demo.local','manager@demo.local','cashier@demo.local','waiter@demo.local')`,
    );
    await c.query('delete from auth.identities where user_id not in (select id from auth.users)'); // left behind by older resets
    await c.query(fs.readFileSync(SEED, 'utf8'));
  } finally {
    await c.end();
  }
}

/** A supabase-js client signed in as a demo role (for setup that is not under test). */
export async function clientAs(role: Role): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: ROLES[role].email, password: PASSWORD });
  if (error) throw error;
  return client;
}

export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.schema('app').rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

let seq = 0;
export const idem = (t: string) => `e2e:${t}:${Date.now()}-${seq++}`;

/** Open the business day as the manager (setup shortcut). */
export async function openDay(): Promise<void> {
  const m = await clientAs('manager');
  await rpc(m, 'open_day');
}

/** Open a tab on a table (by label) as the waiter; returns the tab id. */
export async function openTabOn(label: string, covers = 2): Promise<string> {
  const [t] = await sql<{ id: string }>('select id from dining_tables where label = $1', [label]);
  const w = await clientAs('waiter');
  const r = await rpc<{ tab_id: string }>(w, 'open_tab', { p_table_id: t!.id, p_covers: covers, p_idempotency_key: idem('open') });
  return r.tab_id;
}

export const itemId = async (nameEn: string) =>
  (await sql<{ id: string }>('select id from menu_items where name_en = $1', [nameEn]))[0]!.id;

/** Send items to a tab as the waiter. */
export async function addItems(tabId: string, items: { name: string; qty?: number; modifiers?: string[] }[]): Promise<void> {
  const w = await clientAs('waiter');
  const p_items = [];
  for (const i of items) {
    const modifier_ids = [];
    for (const m of i.modifiers ?? []) modifier_ids.push((await sql<{ id: string }>('select id from modifiers where name_en = $1', [m]))[0]!.id);
    p_items.push({ menu_item_id: await itemId(i.name), qty: i.qty ?? 1, modifier_ids });
  }
  await rpc(w, 'add_items', { p_tab_id: tabId, p_items, p_idempotency_key: idem('add') });
}

/** Open a till shift as the cashier on a fixed device and settle a tab in cash (setup shortcut). */
export async function settleInCash(tabId: string, amount: number): Promise<void> {
  const c = await clientAs('cashier');
  await rpc(c, 'open_till_shift', { p_device_id: 'E2E-SETUP', p_opening_float: 0 }).catch(() => undefined);
  await rpc(c, 'settle_tab', {
    p_tab_id: tabId,
    p_method: 'cash',
    p_amount: amount,
    p_tendered: amount,
    p_device_id: 'E2E-SETUP',
    p_idempotency_key: idem('settle'),
  });
}

export const onHand = async (nameEn: string): Promise<number> =>
  Number((await sql<{ on_hand: string }>('select on_hand from v_ingredient_on_hand where name_en = $1', [nameEn]))[0]!.on_hand);
