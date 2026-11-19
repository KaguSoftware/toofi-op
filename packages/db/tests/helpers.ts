/**
 * Shared harness for the database tests, run against the local stack
 * (`pnpm db:start`, ports in supabase/config.toml).
 *
 * Two ways in:
 *  - Supabase clients through PostgREST/GoTrue, exactly as the app calls:
 *    anonClient(), serviceClient(), createStaffOfRole(role) -> a signed-in client,
 *    appRpc(client, fn, args) for `app.*` functions.
 *  - Direct SQL as the `postgres` superuser (sql, sqlAs, withRollback) for what a
 *    client cannot reach: internal functions (claim_replay, consume_pin_grant),
 *    triggers that fire for every role, and fixtures.
 *
 * Env (defaults are the local stack's): SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, DB_URL. ROP_REQUIRE_STACK=1 turns "skip when the stack
 * is down" into a failure (CI).
 */
import 'dotenv/config';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { idemKey, type StaffRole } from '@rop/core';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55421';
export const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';

// The CLI's long-standing local demo keys (local only, not secrets).
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** The venue seed.sql creates. */
export const VENUE_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_PASSWORD = 'rop-test-password';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, clientOptions);
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);
}

/**
 * True when the local stack answers. Use as `describe.skipIf(!(await stackAvailable()))`.
 * When it does not, prints why the suite is SKIPPED (a skip is not a pass).
 */
export async function stackAvailable(): Promise<boolean> {
  const required = process.env.ROP_REQUIRE_STACK === '1';
  let reason = '';
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) return true;
    reason = `HTTP ${res.status}`;
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
  }
  const message = `local Supabase stack not reachable at ${SUPABASE_URL} (${reason}); run \`pnpm db:start\``;
  if (required) throw new Error(`ROP_REQUIRE_STACK=1 but the ${message}`);
  console.warn(`SKIPPED database tests: ${message}`);
  return false;
}

// ---------------------------------------------------------------------------
// Direct SQL
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;

function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: DB_URL, max: 4 });
  return pool;
}

/** Close the SQL pool. Call from afterAll in any file that used sql/sqlAs/withRollback. */
export async function endDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Run one statement as the `postgres` superuser (bypasses RLS and grants, not triggers). */
export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await db().query<T>(text, params);
  return res.rows;
}

export type Query = <T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

/** Set `auth.uid()` for the rest of this transaction (as PostgREST does from the JWT). */
async function actAs(client: pg.PoolClient, userId: string | null): Promise<void> {
  const claims = userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '';
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
}

/**
 * Run statements in one COMMITTED transaction as the superuser, with auth.uid() =
 * userId. This is how a SECURITY DEFINER money function calls internal helpers, so
 * it is the way to exercise app.claim_replay, app.consume_pin_grant, app.write_audit.
 */
export async function sqlAs<R>(userId: string | null, fn: (q: Query) => Promise<R>): Promise<R> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await actAs(client, userId);
    const q: Query = async (text, params = []) => (await client.query(text, params)).rows;
    const out = await fn(q);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

/** Like sqlAs, but ALWAYS rolls back: for fixtures that must not outlive the test. */
export async function withRollback<R>(
  userId: string | null,
  fn: (q: Query) => Promise<R>,
): Promise<R> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await actAs(client, userId);
    return await fn(async (text, params = []) => (await client.query(text, params)).rows);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export interface TestStaff {
  id: string;
  email: string;
  role: StaffRole;
  /** Signed in as this staff member. */
  client: SupabaseClient;
}

let staffCounter = 0;
const createdUserIds: string[] = [];

/** Sign in an auth user with the test password. */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

/** An auth user with no staff row: signed in, but not staff. */
export async function createOutsider(): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `outsider-${Date.now()}-${staffCounter++}@test.rop.local`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, client: await signedInClient(email) };
}

/**
 * A new active staff member of `role` at the seeded venue, signed in. With `pin`,
 * the PIN is set through app.set_own_pin, so it must be a valid PIN (6-12 digits,
 * not weak). Deactivate everything created with cleanupStaff() in afterAll.
 */
export async function createStaffOfRole(role: StaffRole, pin?: string): Promise<TestStaff> {
  const email = `${role}-${Date.now()}-${staffCounter++}@test.rop.local`;
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const ins = await svc
    .from('staff')
    .insert({ id: data.user.id, venue_id: VENUE_ID, full_name: `Test ${role}`, role });
  if (ins.error) throw new Error(`staff insert failed: ${ins.error.message}`);
  const client = await signedInClient(email);
  if (pin !== undefined) {
    const set = await appRpc(client, 'set_own_pin', { p_pin: pin });
    if (set.error) throw new Error(`set_own_pin failed: ${set.error.message}`);
  }
  return { id: data.user.id, email, role, client };
}

/** Deactivate every staff member this process created (rows stay: history references them). */
export async function cleanupStaff(): Promise<void> {
  if (!createdUserIds.length) return;
  await serviceClient().from('staff').update({ is_active: false }).in('id', createdUserIds);
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

/** Call an `app.*` function as the client's principal. Returns PostgREST's { data, error }. */
export function appRpc(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  return client.schema('app').rpc(fn, args);
}

/**
 * A random valid PIN (8 digits, not weak), so a PIN left active by an earlier,
 * crashed run can never be the one that matches.
 */
export function uniquePin(): string {
  for (;;) {
    const pin = String(10_000_000 + Math.floor(Math.random() * 90_000_000));
    const weak =
      /^(\d)\1*$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin);
    if (!weak) return pin;
  }
}

/** A fresh idempotency key in the app's format, station TEST. */
export function testIdemKey(type: string): string {
  return idemKey('TEST', type);
}

type PgError = { code?: string; message: string } | null;

/** No EXECUTE / table grant: Postgres 42501. */
export function isPermissionDenied(error: PgError): boolean {
  return !!error && (error.code === '42501' || /permission denied/i.test(error.message));
}

/** Refused by the function's own role guard. */
export function isForbidden(error: PgError): boolean {
  return !!error && /\bFORBIDDEN\b/.test(error.message);
}
