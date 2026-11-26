/**
 * Guest QR menu, part 1: table links, guest_menu, open_table_session, session
 * life (expiry, sliding, rotation, inactive table), housekeeping, and the anon
 * surface (exactly five functions, no table).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  isPermissionDenied,
  serviceClient,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';
import { makeMenu, makeTable, openFreshDay, type Menu } from './money-fixtures';
import {
  closeDayDirectly,
  guestKey,
  guestRpc,
  openSession,
  setVenueSwitches,
  tokenOf,
  type OpenedSession,
} from './guest-fixtures';

const up = await stackAvailable();

const GUEST_FUNCTIONS = ['guest_menu', 'guest_status', 'open_table_session', 'raise_waiter_call', 'send_guest_order'];

type MenuJson = {
  venue: { name: string };
  categories: {
    id: string;
    name_en: string;
    name_ar: string;
    sort: number;
    items: {
      id: string;
      name_en: string;
      price: number;
      sort: number;
      modifier_groups: {
        id: string;
        name_en: string;
        min_select: number;
        max_select: number;
        modifiers: { id: string; name_en: string; price_delta: number }[];
      }[];
    }[];
  }[];
};

/** Every object key anywhere in a JSON value. */
function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}

describe.skipIf(!up)('guest sessions, menu and links', () => {
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

  describe('table links', () => {
    it('a new table gets a link with a 22-character base64url token', async () => {
      const table = await makeTable();
      const rows = await sql<{ token: string; guest_enabled: boolean; rotated_at: string | null; venue_id: string }>(
        `select token, guest_enabled, rotated_at, venue_id from table_links where table_id = $1`,
        [table],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(rows[0]!.guest_enabled).toBe(true);
      expect(rows[0]!.rotated_at).toBeNull();
    });

    it('every table has exactly one link (backfill and trigger)', async () => {
      const rows = await sql(
        `select t.id from dining_tables t left join table_links l on l.table_id = t.id where l.table_id is null`,
      );
      expect(rows).toEqual([]);
    });

    it('staff read links but never the token column', async () => {
      const table = await makeTable();
      const ok = await manager.client.from('table_links').select('table_id, guest_enabled, rotated_at').eq('table_id', table);
      expect(ok.error).toBeNull();
      expect(ok.data).toHaveLength(1);
      const token = await manager.client.from('table_links').select('token').eq('table_id', table);
      expect(isPermissionDenied(token.error), token.error?.message ?? 'token was readable').toBe(true);
    });
  });

  describe('guest_menu', () => {
    it('returns the venue and the active menu in sort order, with modifiers', async () => {
      const { data, error } = await guestRpc('guest_menu');
      expect(error).toBeNull();
      const m = data as MenuJson;
      expect(typeof m.venue.name).toBe('string');
      const items = m.categories.flatMap((c) => c.items);
      const ids = items.map((i) => i.id);
      expect(ids).toContain(menu.burger);
      expect(ids).toContain(menu.steak);
      expect(ids).not.toContain(menu.soup);
      const steak = items.find((i) => i.id === menu.steak)!;
      expect(steak.price).toBe(20000);
      const groups = steak.modifier_groups;
      expect(groups.map((g) => [g.min_select, g.max_select]).sort()).toEqual([
        [0, 2],
        [1, 1],
      ]);
      const mods = groups.flatMap((g) => g.modifiers.map((x) => x.id));
      expect(mods).toContain(menu.mod.rare);
      expect(mods).toContain(menu.mod.cheese);
      expect(mods).not.toContain(menu.mod.egg); // inactive
      expect(mods).not.toContain(menu.mod.foreign); // group not linked to steak
      const sorts = m.categories.map((c) => c.sort);
      expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
    });

    it('hides inactive categories and never carries cost, recipe, stock or tax data', async () => {
      const [cat] = await sql<{ id: string }>(
        `insert into menu_categories (name_en, name_ar, is_active) values ('Hidden cat', 'مخفي', false) returning id`,
      );
      const [tax] = await sql<{ id: string }>(`select id from tax_groups limit 1`);
      const [item] = await sql<{ id: string }>(
        `insert into menu_items (category_id, name_en, name_ar, price, tax_group_id)
         values ($1, 'In hidden cat', 'مخفي', 1000, $2) returning id`,
        [cat!.id, tax!.id],
      );
      const { data } = await guestRpc('guest_menu');
      const m = data as MenuJson;
      expect(m.categories.map((c) => c.id)).not.toContain(cat!.id);
      expect(m.categories.flatMap((c) => c.items).map((i) => i.id)).not.toContain(item!.id);
      const keys = [...allKeys(data)];
      expect(keys.filter((k) => /cost|recipe|stock|tax|ingredient|is_active/i.test(k))).toEqual([]);
    });
  });

  describe('open_table_session', () => {
    it('opens a session for a valid token and reports the switches and the day', async () => {
      const table = await makeTable();
      const { data, error } = await guestRpc('open_table_session', { p_token: await tokenOf(table) });
      expect(error).toBeNull();
      const s = data as OpenedSession;
      const [label] = await sql<{ label: string }>(`select label from dining_tables where id = $1`, [table]);
      expect(s).toMatchObject({ table_label: label!.label, calls_enabled: true, orders_enabled: true, day_open: true });
      const [row] = await sql<{ table_id: string; venue_id: string; mins: number; closed_at: string | null }>(
        `select table_id, venue_id, closed_at,
                extract(epoch from expires_at - now()) / 60 as mins
           from app.guest_sessions where id = $1`,
        [s.session_id],
      );
      expect(row).toMatchObject({ table_id: table, closed_at: null });
      expect(Number(row!.mins)).toBeGreaterThan(89);
      expect(Number(row!.mins)).toBeLessThanOrEqual(90);
    });

    it('reports the switches when they are off', async () => {
      const table = await makeTable();
      await setVenueSwitches(false, true);
      await sql(`update table_links set guest_enabled = false where table_id = $1`, [table]);
      const off = (await guestRpc('open_table_session', { p_token: await tokenOf(table) })).data as OpenedSession;
      expect(off).toMatchObject({ calls_enabled: false, orders_enabled: false });
      await sql(`update table_links set guest_enabled = true where table_id = $1`, [table]);
      const callsOff = (await guestRpc('open_table_session', { p_token: await tokenOf(table) })).data as OpenedSession;
      expect(callsOff).toMatchObject({ calls_enabled: false, orders_enabled: true });
    });

    it('an unknown, blank or missing token, or an inactive table, is TABLE_LINK_INVALID', async () => {
      for (const token of ['AAAAAAAAAAAAAAAAAAAAAA', '', null, 'x'.repeat(500)]) {
        const { error } = await guestRpc('open_table_session', { p_token: token });
        expect(error?.message, String(token)).toBe('TABLE_LINK_INVALID');
      }
      const table = await makeTable();
      await sql(`update dining_tables set is_active = false where id = $1`, [table]);
      const { error } = await guestRpc('open_table_session', { p_token: await tokenOf(table) });
      expect(error?.message).toBe('TABLE_LINK_INVALID');
    });

    it('more than 30 new sessions for one table in a minute is TOO_MANY_REQUESTS', async () => {
      const table = await makeTable();
      const token = await tokenOf(table);
      for (let i = 0; i < 30; i++) {
        const { error } = await guestRpc('open_table_session', { p_token: token });
        expect(error, `session ${i + 1}`).toBeNull();
      }
      const { error } = await guestRpc('open_table_session', { p_token: token });
      expect(error?.message).toBe('TOO_MANY_REQUESTS');
      // Another table is not affected.
      expect((await guestRpc('open_table_session', { p_token: await tokenOf(await makeTable()) })).error).toBeNull();
      // A minute later the table may open sessions again.
      await sql(`update app.guest_sessions set created_at = created_at - interval '61 seconds' where table_id = $1`, [
        table,
      ]);
      expect((await guestRpc('open_table_session', { p_token: token })).error).toBeNull();
    });
  });

  describe('session life', () => {
    const live = async (sessionId: string) =>
      (await guestRpc('guest_status', { p_session_id: sessionId })).error?.message ?? 'live';

    it('an unknown or missing session id is SESSION_EXPIRED', async () => {
      expect(await live('00000000-0000-4000-8000-00000000dead')).toBe('SESSION_EXPIRED');
      expect((await guestRpc('guest_status', { p_session_id: null })).error?.message).toBe('SESSION_EXPIRED');
    });

    it('an expired or closed session is SESSION_EXPIRED for every guest call', async () => {
      const table = await makeTable();
      const expired = await openSession(table);
      const closed = await openSession(table);
      await sql(`update app.guest_sessions set expires_at = now() - interval '1 second' where id = $1`, [expired]);
      await sql(`update app.guest_sessions set closed_at = now() where id = $1`, [closed]);
      for (const s of [expired, closed]) {
        expect(await live(s)).toBe('SESSION_EXPIRED');
        const call = await guestRpc('raise_waiter_call', {
          p_session_id: s,
          p_reason: 'water',
          p_idempotency_key: guestKey('call'),
        });
        expect(call.error?.message).toBe('SESSION_EXPIRED');
        const order = await guestRpc('send_guest_order', {
          p_session_id: s,
          p_items: [{ menu_item_id: menu.burger, qty: 1 }],
          p_idempotency_key: guestKey('order'),
        });
        expect(order.error?.message).toBe('SESSION_EXPIRED');
      }
    });

    it('a session on a table that was deactivated is SESSION_EXPIRED', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      await sql(`update dining_tables set is_active = false where id = $1`, [table]);
      expect(await live(s)).toBe('SESSION_EXPIRED');
    });

    it('activity slides the expiry to 90 minutes; guest_status does not', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const minutesLeft = async () =>
        Number(
          (
            await sql<{ m: number }>(
              `select extract(epoch from expires_at - now()) / 60 as m from app.guest_sessions where id = $1`,
              [s],
            )
          )[0]!.m,
        );
      await sql(`update app.guest_sessions set expires_at = now() + interval '5 minutes' where id = $1`, [s]);
      expect(await live(s)).toBe('live');
      expect(await minutesLeft()).toBeLessThan(6);
      const call = await guestRpc('raise_waiter_call', {
        p_session_id: s,
        p_reason: 'help',
        p_idempotency_key: guestKey('call'),
      });
      expect(call.error).toBeNull();
      expect(await minutesLeft()).toBeGreaterThan(89);
      await sql(`update app.guest_sessions set expires_at = now() + interval '5 minutes' where id = $1`, [s]);
      await guestRpc('send_guest_order', {
        p_session_id: s,
        p_items: [{ menu_item_id: menu.tea, qty: 1 }],
        p_idempotency_key: guestKey('order'),
      });
      expect(await minutesLeft()).toBeGreaterThan(89);
    });

    it('rotating the token kills the old token and closes the live sessions', async () => {
      const table = await makeTable();
      const oldToken = await tokenOf(table);
      const s1 = await openSession(table);
      const s2 = await openSession(table);
      const { data, error } = await appRpc(owner.client, 'rotate_table_token', { p_table_id: table });
      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain(oldToken);
      const newToken = await tokenOf(table);
      expect(newToken).not.toBe(oldToken);
      expect(JSON.stringify(data)).not.toContain(newToken);
      expect(newToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(await live(s1)).toBe('SESSION_EXPIRED');
      expect(await live(s2)).toBe('SESSION_EXPIRED');
      expect((await guestRpc('open_table_session', { p_token: oldToken })).error?.message).toBe('TABLE_LINK_INVALID');
      expect((await guestRpc('open_table_session', { p_token: newToken })).error).toBeNull();
      const [link] = await sql<{ rotated_at: string | null }>(`select rotated_at from table_links where table_id = $1`, [
        table,
      ]);
      expect(link!.rotated_at).not.toBeNull();
    });
  });

  describe('guest_status basics', () => {
    it('returns the table, switches and day, and is read-only', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      const { data, error } = await guestRpc('guest_status', { p_session_id: s });
      expect(error).toBeNull();
      expect(data).toMatchObject({
        day_open: true,
        calls_enabled: true,
        orders_enabled: true,
        call: null,
        call_again_at: null,
        orders: [],
      });
    });

    it('reports day_open false when no business day is open', async () => {
      const table = await makeTable();
      const s = await openSession(table);
      await closeDayDirectly();
      try {
        const { data } = await guestRpc('guest_status', { p_session_id: s });
        expect(data).toMatchObject({ day_open: false });
        const opened = (await guestRpc('open_table_session', { p_token: await tokenOf(table) })).data as OpenedSession;
        expect(opened.day_open).toBe(false);
      } finally {
        await openFreshDay(manager);
      }
    });
  });

  describe('housekeeping', () => {
    it('purges guest sessions that expired or closed more than a day ago', async () => {
      const table = await makeTable();
      const fresh = await openSession(table);
      const oldExpired = await openSession(table);
      const oldClosed = await openSession(table);
      await sql(`update app.guest_sessions set expires_at = now() - interval '25 hours' where id = $1`, [oldExpired]);
      await sql(`update app.guest_sessions set closed_at = now() - interval '25 hours' where id = $1`, [oldClosed]);
      const { data, error } = await serviceClient().schema('app').rpc('purge_housekeeping');
      expect(error).toBeNull();
      expect((data as { guest_sessions: number }).guest_sessions).toBeGreaterThanOrEqual(2);
      const left = await sql<{ id: string }>(`select id from app.guest_sessions where table_id = $1`, [table]);
      expect(left.map((r) => r.id)).toEqual([fresh]);
    });
  });

  describe('anon surface', () => {
    it('anon can execute exactly the five guest functions', async () => {
      const rows = await sql<{ name: string }>(
        `select n.nspname || '.' || p.proname as name
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'EXECUTE')
          order by 1`,
      );
      expect(rows.map((r) => r.name)).toEqual(GUEST_FUNCTIONS.map((f) => `app.${f}`).sort());
    });

    it('anon can select no table, view or column', async () => {
      const rows = await sql(
        `select n.nspname, c.relname
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'app') and c.relkind in ('r', 'v', 'm', 'p', 'f')
            and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'))`,
      );
      expect(rows).toEqual([]);
      for (const t of ['table_links', 'waiter_calls', 'guest_orders']) {
        const { error } = await anonClient().from(t).select('table_id').limit(1);
        expect(isPermissionDenied(error), `${t}: ${error?.message}`).toBe(true);
      }
    });

    it('a signed-in staff member cannot call the guest functions', async () => {
      const { error } = await appRpc(manager.client, 'guest_menu');
      expect(isPermissionDenied(error), error?.message).toBe(true);
    });
  });
});
