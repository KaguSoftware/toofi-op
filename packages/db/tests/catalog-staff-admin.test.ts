/**
 * The staff-admin edge function: owner-only creation of staff logins (auth user +
 * staff row, all or nothing) and password resets. Needs the edge runtime that
 * `supabase start` runs; the function is served at /functions/v1/staff-admin.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANON_KEY,
  SUPABASE_URL,
  TEST_PASSWORD,
  anonClient,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  serviceClient,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';

const up = await stackAvailable();
const URL = `${SUPABASE_URL}/functions/v1/staff-admin`;
const stamp = Date.now();
const newEmails: string[] = [];

async function call(token: string | null, body: unknown) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

async function tokenOf(s: TestStaff): Promise<string> {
  const { data } = await s.client.auth.getSession();
  return data.session!.access_token;
}

describe.skipIf(!up)('staff-admin edge function', () => {
  let owner: TestStaff;
  let manager: TestStaff;
  let ownerToken: string;

  beforeAll(async () => {
    owner = await createStaffOfRole('owner');
    manager = await createStaffOfRole('manager');
    ownerToken = await tokenOf(owner);
  });
  afterAll(async () => {
    await sql(`drop trigger if exists test_fail_staff_insert on staff`);
    await sql(`drop function if exists public.test_fail_staff_insert()`);
    await sql(`drop trigger if exists test_fail_audit on audit_log`);
    await sql(`drop function if exists public.test_fail_audit()`);
    await cleanupStaff();
    for (const email of newEmails) {
      await sql(`update staff set is_active = false where id in (select id from auth.users where email = $1)`, [email]);
    }
    await endDb();
  });

  const authUserCount = async (email: string) =>
    Number((await sql<{ n: string }>(`select count(*) n from auth.users where email = $1`, [email]))[0]!.n);

  it('an owner creates a staff member who can then sign in with the given password', async () => {
    const email = `new-${stamp}@test.rop.local`;
    newEmails.push(email);
    const res = await call(ownerToken, {
      action: 'create', email, password: 'a-fresh-password', full_name: 'Fresh Cashier', role: 'cashier',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const staffId = res.body!.staff_id as string;

    const row = await sql(`select full_name, role, is_active, venue_id from staff where id = $1`, [staffId]);
    expect(row[0]).toMatchObject({ full_name: 'Fresh Cashier', role: 'cashier', is_active: true });

    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password: 'a-fresh-password' });
    expect(signIn.error).toBeNull();
    const me = await client.from('staff').select('role').eq('id', staffId);
    expect(me.data).toEqual([{ role: 'cashier' }]);

    const audit = await sql(`select actor_id from audit_log where action = 'staff.create' and entity_id = $1`, [staffId]);
    expect(audit[0]).toEqual({ actor_id: owner.id });
  });

  it('a duplicate email is a 409 EMAIL_TAKEN', async () => {
    const res = await call(ownerToken, {
      action: 'create', email: owner.email, password: 'a-fresh-password', full_name: 'Dup', role: 'waiter',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'EMAIL_TAKEN' });
  });

  it('validates the body with 400 and plain JSON errors', async () => {
    const base = { action: 'create', email: `v-${stamp}@test.rop.local`, password: 'a-fresh-password', full_name: 'V', role: 'waiter' };
    const bad = async (o: Record<string, unknown>) => (await call(ownerToken, { ...base, ...o }));
    expect((await bad({ password: 'short' })).body).toEqual({ error: 'PASSWORD_TOO_SHORT' });
    expect((await bad({ email: 'nope' })).body).toEqual({ error: 'INVALID_EMAIL' });
    expect((await bad({ full_name: '  ' })).body).toEqual({ error: 'NAME_REQUIRED' });
    expect((await bad({ role: 'admin' })).body).toEqual({ error: 'ROLE_REQUIRED' });
    expect((await bad({ action: 'explode' })).status).toBe(400);
    expect(await authUserCount(base.email)).toBe(0);
  });

  it('a non-owner gets 403 and nothing is created', async () => {
    const email = `nope-${stamp}@test.rop.local`;
    const res = await call(await tokenOf(manager), {
      action: 'create', email, password: 'a-fresh-password', full_name: 'X', role: 'waiter',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'FORBIDDEN' });
    expect(await authUserCount(email)).toBe(0);
  });

  it('a signed-in user who is not staff, and a deactivated owner, get 403', async () => {
    const svc = serviceClient();
    const outsider = await svc.auth.admin.createUser({ email: `out-${stamp}@test.rop.local`, password: TEST_PASSWORD, email_confirm: true });
    const c = anonClient();
    await c.auth.signInWithPassword({ email: `out-${stamp}@test.rop.local`, password: TEST_PASSWORD });
    const t = (await c.auth.getSession()).data.session!.access_token;
    expect((await call(t, { action: 'create', email: `o2-${stamp}@test.rop.local`, password: 'a-fresh-password', full_name: 'X', role: 'waiter' })).status).toBe(403);
    await svc.auth.admin.deleteUser(outsider.data.user!.id);

    const gone = await createStaffOfRole('owner');
    const token = await tokenOf(gone);
    await sql(`update staff set is_active = false where id = $1`, [gone.id]);
    expect((await call(token, { action: 'reset_password', staff_id: owner.id, password: 'whatever-123' })).status).toBe(403);
  });

  it('without a session the gateway or the function answers 401', async () => {
    const res = await call(null, { action: 'create' });
    expect(res.status).toBe(401);
  });

  it('a failed staff insert leaves no orphan auth user', async () => {
    const email = `orphan-${stamp}@test.rop.local`;
    await sql(`
      create or replace function public.test_fail_staff_insert() returns trigger language plpgsql as $f$
      begin
        if new.full_name = 'FAIL_INSERT' then raise exception 'forced failure'; end if;
        return new;
      end $f$`);
    await sql(`drop trigger if exists test_fail_staff_insert on staff`);
    await sql(`create trigger test_fail_staff_insert before insert on staff
               for each row execute function public.test_fail_staff_insert()`);
    try {
      const res = await call(ownerToken, {
        action: 'create', email, password: 'a-fresh-password', full_name: 'FAIL_INSERT', role: 'waiter',
      });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'INTERNAL' });
      expect(await authUserCount(email)).toBe(0);
    } finally {
      await sql(`drop trigger if exists test_fail_staff_insert on staff`);
      await sql(`drop function if exists public.test_fail_staff_insert()`);
    }
  });

  it('resets a password: the new one signs in, the old one does not', async () => {
    const target = await createStaffOfRole('waiter');
    const res = await call(ownerToken, { action: 'reset_password', staff_id: target.id, password: 'brand-new-pass-1' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await anonClient().auth.signInWithPassword({ email: target.email, password: 'brand-new-pass-1' })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email: target.email, password: TEST_PASSWORD })).error).not.toBeNull();

    expect((await call(ownerToken, { action: 'reset_password', staff_id: '00000000-0000-4000-8000-00000000dead', password: 'brand-new-pass-1' })).body).toEqual({ error: 'STAFF_NOT_FOUND' });
    expect((await call(ownerToken, { action: 'reset_password', staff_id: 'not-a-uuid', password: 'brand-new-pass-1' })).body).toEqual({ error: 'BAD_REQUEST' });
    expect((await call(await tokenOf(manager), { action: 'reset_password', staff_id: target.id, password: 'brand-new-pass-1' })).status).toBe(403);
  });

  it("a reset signs out the person's existing sessions", async () => {
    const target = await createStaffOfRole('waiter');
    const before = await target.client.auth.refreshSession();
    expect(before.error).toBeNull();
    const res = await call(ownerToken, { action: 'reset_password', staff_id: target.id, password: 'signed-out-pass-1' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sessions = await sql<{ n: string }>(`select count(*) n from auth.sessions where user_id = $1`, [target.id]);
    expect(sessions[0]!.n).toBe('0');
    expect((await target.client.auth.refreshSession()).error).not.toBeNull();
  });

  describe('when the audit row cannot be written', () => {
    beforeAll(async () => {
      await sql(`
        create or replace function public.test_fail_audit() returns trigger language plpgsql as $f$
        begin
          if new.after ->> 'full_name' = 'FAIL_AUDIT'
             or new.entity_id in (select id from staff where full_name = 'Audit fails for me') then
            raise exception 'forced audit failure';
          end if;
          return new;
        end $f$`);
      await sql(`drop trigger if exists test_fail_audit on audit_log`);
      await sql(`create trigger test_fail_audit before insert on audit_log
                 for each row execute function public.test_fail_audit()`);
    });
    afterAll(async () => {
      await sql(`drop trigger if exists test_fail_audit on audit_log`);
      await sql(`drop function if exists public.test_fail_audit()`);
    });

    it('create answers 500 and leaves no login and no staff row', async () => {
      const email = `noaudit-${stamp}@test.rop.local`;
      const res = await call(ownerToken, {
        action: 'create', email, password: 'a-fresh-password', full_name: 'FAIL_AUDIT', role: 'waiter',
      });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'INTERNAL' });
      expect(await authUserCount(email)).toBe(0);
      expect(await sql(`select 1 from staff where full_name = 'FAIL_AUDIT'`)).toHaveLength(0);
    });

    it('reset_password answers 500 and the password is unchanged', async () => {
      const target = await createStaffOfRole('waiter');
      await sql(`update staff set full_name = 'Audit fails for me' where id = $1`, [target.id]);
      const res = await call(ownerToken, { action: 'reset_password', staff_id: target.id, password: 'never-applied-1' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'INTERNAL' });
      expect((await anonClient().auth.signInWithPassword({ email: target.email, password: TEST_PASSWORD })).error).toBeNull();
    });
  });
});
