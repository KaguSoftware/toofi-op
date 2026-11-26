/**
 * Guest QR menu, part 2: waiter calls. raise_waiter_call (check order, one open
 * call per table, the 120 second cooldown, switches, replay), answer_waiter_call,
 * and how calls show in guest_status and guest_inbox.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';
import { makeTable, openFreshDay } from './money-fixtures';
import { closeDayDirectly, guestKey, guestRpc, openSession, setVenueSwitches } from './guest-fixtures';

const up = await stackAvailable();

interface CallResult {
  call_id: string;
  status: string;
  reason: string;
  called_at: string;
  already: boolean;
}

interface Inbox {
  calls: { id: string; table_id: string; table_label: string; reason: string; called_at: string }[];
  orders: unknown[];
}

describe.skipIf(!up)('guest waiter calls', () => {
  let manager: TestStaff;
  let waiter: TestStaff;
  let day = '';

  const raise = (session: string, reason = 'water', key = guestKey('call')) =>
    guestRpc('raise_waiter_call', { p_session_id: session, p_reason: reason, p_idempotency_key: key });

  /** Pretend the table's calls were raised `seconds` ago. */
  const ageCalls = (table: string, seconds: number) =>
    sql(`update waiter_calls set called_at = called_at - make_interval(secs => $2) where table_id = $1`, [
      table,
      seconds,
    ]);

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    waiter = await createStaffOfRole('waiter');
    day = await openFreshDay(manager);
  });

  afterEach(async () => {
    await setVenueSwitches(true, true);
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('raises a call on the open day for the session’s table', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    const { data, error } = await raise(s, 'bill');
    expect(error).toBeNull();
    const r = data as CallResult;
    expect(r).toMatchObject({ status: 'waiting', reason: 'bill', already: false });
    const rows = await sql(
      `select table_id, day_session_id, guest_session_id, reason::text as reason, answered_at,
              venue_id = (select id from venues limit 1) as venue_ok
         from waiter_calls where id = $1`,
      [r.call_id],
    );
    expect(rows).toEqual([
      { table_id: table, day_session_id: day, guest_session_id: s, reason: 'bill', answered_at: null, venue_ok: true },
    ]);
  });

  it('replays by idempotency key, and needs a key', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    const key = guestKey('call');
    const first = await raise(s, 'order', key);
    const again = await raise(s, 'order', key);
    expect(again.error).toBeNull();
    expect(again.data).toEqual(first.data);
    expect(await sql(`select id from waiter_calls where table_id = $1`, [table])).toHaveLength(1);
    for (const blank of ['', '  ', null]) {
      expect((await raise(s, 'order', blank as string)).error?.message).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
  });

  it('the same key from another session is a new call, not the first session’s result', async () => {
    const tableA = await makeTable();
    const tableB = await makeTable();
    const a = await openSession(tableA);
    const b = await openSession(tableB);
    const key = guestKey('call');
    const ra = (await raise(a, 'water', key)).data as CallResult;
    const rb = (await raise(b, 'water', key)).data as CallResult;
    expect(rb.call_id).not.toBe(ra.call_id);
  });

  it('one open call per table: a second call returns the open one with already: true', async () => {
    const table = await makeTable();
    const s1 = await openSession(table);
    const s2 = await openSession(table);
    const first = (await raise(s1, 'water')).data as CallResult;
    const second = await raise(s2, 'help');
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ call_id: first.call_id, reason: 'water', status: 'waiting', already: true });
    expect(await sql(`select id from waiter_calls where table_id = $1`, [table])).toHaveLength(1);
  });

  it('a new call within 120 seconds of the last one is CALL_TOO_SOON, after it is allowed', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    const first = (await raise(s)).data as CallResult;
    const ans = await appRpc(waiter.client, 'answer_waiter_call', { p_call_id: first.call_id });
    expect(ans.error).toBeNull();
    expect((await raise(s)).error?.message).toBe('CALL_TOO_SOON');
    await ageCalls(table, 100);
    expect((await raise(s)).error?.message).toBe('CALL_TOO_SOON');
    await ageCalls(table, 21);
    const next = await raise(s, 'bill');
    expect(next.error).toBeNull();
    expect((next.data as CallResult).call_id).not.toBe(first.call_id);
  });

  it('GUEST_CALLS_OFF when the venue or the table switch is off', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    await setVenueSwitches(false, true);
    expect((await raise(s)).error?.message).toBe('GUEST_CALLS_OFF');
    await setVenueSwitches(true, false); // ordering off does not stop calls
    await sql(`update table_links set guest_enabled = false where table_id = $1`, [table]);
    expect((await raise(s)).error?.message).toBe('GUEST_CALLS_OFF');
    await sql(`update table_links set guest_enabled = true where table_id = $1`, [table]);
    expect((await raise(s)).error).toBeNull();
  });

  it('a session check comes before the switch check', async () => {
    const table = await makeTable();
    const s = await openSession(table);
    await sql(`update app.guest_sessions set closed_at = now() where id = $1`, [s]);
    await setVenueSwitches(false, false);
    expect((await raise(s)).error?.message).toBe('SESSION_EXPIRED');
  });

  describe('answer_waiter_call', () => {
    it('one tap answers; a second tap returns already: true and changes nothing', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const call = (await raise(s)).data as CallResult;
      const first = await appRpc(waiter.client, 'answer_waiter_call', { p_call_id: call.call_id });
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({ call_id: call.call_id, status: 'answered', already: false });
      const [row] = await sql<{ answered_at: Date; answered_by: string }>(
        `select answered_at, answered_by from waiter_calls where id = $1`,
        [call.call_id],
      );
      expect(row!.answered_by).toBe(waiter.id);
      const second = await appRpc(manager.client, 'answer_waiter_call', { p_call_id: call.call_id });
      expect(second.error).toBeNull();
      expect(second.data).toMatchObject({ call_id: call.call_id, already: true });
      const [after] = await sql<{ answered_at: Date; answered_by: string }>(
        `select answered_at, answered_by from waiter_calls where id = $1`,
        [call.call_id],
      );
      expect(after).toEqual(row);
    });

    it('an unknown call is WAITER_CALL_NOT_FOUND', async () => {
      const { error } = await appRpc(waiter.client, 'answer_waiter_call', {
        p_call_id: '00000000-0000-4000-8000-00000000dead',
      });
      expect(error?.message).toBe('WAITER_CALL_NOT_FOUND');
    });
  });

  describe('guest_status and guest_inbox', () => {
    it('the guest sees waiting, then answered, and when they may call again', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const other = await openSession(table);
      const call = (await raise(s, 'bill')).data as CallResult;

      const status = async (session: string) =>
        (await guestRpc('guest_status', { p_session_id: session })).data as {
          call: { id: string; reason: string; status: string; answered_at: string | null } | null;
          call_again_at: string | null;
        };
      const waiting = await status(s);
      expect(waiting.call).toMatchObject({ id: call.call_id, reason: 'bill', status: 'waiting', answered_at: null });
      expect(waiting.call_again_at).not.toBeNull();
      // The table's open call shows to every session of the table.
      expect((await status(other)).call?.id).toBe(call.call_id);

      await appRpc(waiter.client, 'answer_waiter_call', { p_call_id: call.call_id });
      const answered = await status(s);
      expect(answered.call).toMatchObject({ id: call.call_id, status: 'answered' });
      expect(answered.call?.answered_at).not.toBeNull();
      // Once answered, another session no longer sees this session's call.
      expect((await status(other)).call).toBeNull();

      await ageCalls(table, 121);
      expect((await status(s)).call_again_at).toBeNull();
    });

    it('the inbox lists open calls of the open day, oldest first, with the table label', async () => {
      const t1 = await makeTable();
      const t2 = await makeTable();
      const c1 = (await raise(await openSession(t1), 'water')).data as CallResult;
      const c2 = (await raise(await openSession(t2), 'help')).data as CallResult;
      const { data, error } = await appRpc(waiter.client, 'guest_inbox');
      expect(error).toBeNull();
      const inbox = data as Inbox;
      const mine = inbox.calls.filter((c) => [c1.call_id, c2.call_id].includes(c.id));
      expect(mine.map((c) => c.id)).toEqual([c1.call_id, c2.call_id]);
      const [label] = await sql<{ label: string }>(`select label from dining_tables where id = $1`, [t1]);
      expect(mine[0]).toMatchObject({ table_id: t1, table_label: label!.label, reason: 'water' });
      const times = inbox.calls.map((c) => c.called_at);
      expect([...times].sort()).toEqual(times);

      await appRpc(waiter.client, 'answer_waiter_call', { p_call_id: c1.call_id });
      const after = (await appRpc(waiter.client, 'guest_inbox')).data as Inbox;
      expect(after.calls.map((c) => c.id)).not.toContain(c1.call_id);
      expect(after.calls.map((c) => c.id)).toContain(c2.call_id);
    });
  });

  describe('without an open business day', () => {
    it('raise_waiter_call is DAY_NOT_OPEN and the inbox is empty', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      await closeDayDirectly();
      try {
        expect((await raise(s)).error?.message).toBe('DAY_NOT_OPEN');
        const inbox = (await appRpc(waiter.client, 'guest_inbox')).data as Inbox;
        expect(inbox).toEqual({ calls: [], orders: [] });
      } finally {
        day = await openFreshDay(manager);
      }
    });
  });
});
