/**
 * backend-final fixes:
 *  - a manager PIN grant may be bound to a value: apply_discount spends only a
 *    grant whose value is NULL or its p_value, refund only one whose value is
 *    NULL or its p_amount; a failed gated call leaves no grant usable for
 *    another value;
 *  - till variance alerts: venue_settings.variance_alert_iqd, the
 *    till_shift.variance_alert audit and app.shift_variances;
 *  - app.purge_housekeeping (service role only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  isPermissionDenied,
  serviceClient,
  sql,
  sqlAs,
  stackAvailable,
  testIdemKey,
  uniquePin,
  VENUE_ID,
  withRollback,
  type Query,
  type TestStaff,
} from './helpers';
import { addItems, makeMenu, openFreshDay, openTab, type Menu } from './money-fixtures';

const up = await stackAvailable();
const PIN = uniquePin();
const rnd = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!up)('backend-final fixes', () => {
  let owner: TestStaff;
  let manager: TestStaff;
  let cashier: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;

  beforeAll(async () => {
    owner = await createStaffOfRole('owner');
    manager = await createStaffOfRole('manager', PIN);
    cashier = await createStaffOfRole('cashier');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    await openFreshDay(manager);
  });

  afterAll(async () => {
    await sql(`update venue_settings set variance_alert_iqd = 5000 where venue_id = $1`, [VENUE_ID]);
    await cleanupStaff();
    await endDb();
  });

  const verify = (s: TestStaff, action: string, entity?: string, value?: number) =>
    appRpc(s.client, 'verify_manager_pin', {
      p_pin: PIN,
      p_action: action,
      ...(entity ? { p_entity_id: entity } : {}),
      ...(value !== undefined ? { p_value: value } : {}),
    });

  const discount = (s: TestStaff, tab: string, value: number) =>
    appRpc(s.client, 'apply_discount', {
      p_tab_id: tab,
      p_kind: 'discount_amount',
      p_value: value,
      p_reason: 'regular',
      p_idempotency_key: testIdemKey('discount'),
    });

  const refund = (s: TestStaff, payment: string, amount: number) =>
    appRpc(s.client, 'refund', {
      p_payment_id: payment,
      p_amount: amount,
      p_reason: 'cold food',
      p_device_id: `till-${rnd()}`,
      p_idempotency_key: testIdemKey('refund'),
    });

  describe('PIN grants bound to a value', () => {
    it('a discount grant for 500 cannot discount 1,000, and does discount 500', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
      expect((await verify(cashier, 'discount', tab, 500)).data).toMatchObject({ ok: true });
      expect((await discount(cashier, tab, 1000)).error?.message).toBe('PIN_GRANT_REQUIRED');
      const ok = await discount(cashier, tab, 500);
      expect(ok.error).toBeNull();
      expect(ok.data).toMatchObject({ amount: 500 });
    });

    it('an unbound-value grant still discounts any value (backward compatible)', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
      expect((await verify(cashier, 'discount', tab)).data).toMatchObject({ ok: true });
      expect((await discount(cashier, tab, 1234)).error).toBeNull();
    });

    it('a failed gated call leaves no grant usable for a different value', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: menu.tea, qty: 1 }]);
      // Fully discounted by a manager, so the tab settles at 0 and the next discount fails.
      expect((await discount(manager, tab, 1500)).error).toBeNull();
      // A grant bound to the value only (any tab), so only the value can stop it.
      expect((await verify(cashier, 'discount', undefined, 700)).data).toMatchObject({ ok: true });
      expect((await discount(cashier, tab, 700)).error?.message).toBe('TAB_NOT_OPEN');
      // The failed call left the grant live but still bound to 700.
      const grants = await sql<{ value: string; consumed_at: string | null }>(
        `select value, consumed_at from app.pin_grants
          where actor_id = $1 and action = 'discount' and entity_id is null`,
        [cashier.id],
      );
      expect(grants).toEqual([{ value: '700', consumed_at: null }]);
      const other = await openTab(waiter);
      await addItems(waiter, other, [{ menu_item_id: menu.burger, qty: 1 }]);
      expect((await discount(cashier, other, 9000)).error?.message).toBe('PIN_GRANT_REQUIRED');
      expect((await discount(cashier, other, 700)).error).toBeNull();
    });

    it('a grant consumed by a call that then rolls back is live again, still only for its value', async () => {
      expect((await verify(cashier, 'refund', undefined, 400)).data).toMatchObject({ ok: true });
      const consume = (q: Query, value: number) =>
        q(`select app.consume_pin_grant('refund', null, $1::bigint)`, [value]);
      await withRollback(cashier.id, async (q) => {
        await consume(q, 400); // spent, then the whole call rolls back
      });
      await expect(sqlAs(cashier.id, (q) => consume(q, 900))).rejects.toThrow('PIN_GRANT_REQUIRED');
      await expect(sqlAs(cashier.id, (q) => consume(q, 400))).resolves.toBeTruthy();
    });

    it('a refund grant for 2,000 cannot refund 3,000, and does refund 2,000', async () => {
      const tab = await openTab(waiter);
      await addItems(waiter, tab, [{ menu_item_id: menu.burger, qty: 1 }]);
      const pay = await appRpc(manager.client, 'settle_tab', {
        p_tab_id: tab,
        p_method: 'card',
        p_amount: 12000,
        p_tendered: null,
        p_device_id: `till-${rnd()}`,
        p_idempotency_key: testIdemKey('pay'),
      });
      expect(pay.error).toBeNull();
      const payment = (pay.data as { payment_id: string }).payment_id;
      expect((await verify(cashier, 'refund', payment, 2000)).data).toMatchObject({ ok: true });
      expect((await refund(cashier, payment, 3000)).error?.message).toBe('PIN_GRANT_REQUIRED');
      const ok = await refund(cashier, payment, 2000);
      expect(ok.error).toBeNull();
      expect(ok.data).toMatchObject({ amount: 2000 });
    });
  });

  describe('till variance alerts', () => {
    const setThreshold = (v: number) =>
      appRpc(owner.client, 'update_venue_settings', { p_variance_alert_iqd: v });

    const shift = async (s: TestStaff, float: number) => {
      const device = `till-${rnd()}`;
      const { data, error } = await appRpc(s.client, 'open_till_shift', { p_device_id: device, p_opening_float: float });
      if (error) throw new Error(error.message);
      return { id: (data as { shift_id: string }).shift_id, device };
    };

    const alerts = (shiftId: string) =>
      sql<{ after: Record<string, unknown> }>(
        `select after from audit_log where action = 'till_shift.variance_alert' and entity_id = $1`,
        [shiftId],
      );

    it('the threshold defaults to 5,000 IQD; only the owner may change it, never below 0', async () => {
      const [row] = await sql<{ d: string }>(
        `select column_default as d from information_schema.columns
          where table_name = 'venue_settings' and column_name = 'variance_alert_iqd'`,
      );
      expect(row?.d).toBe('5000');
      expect((await appRpc(manager.client, 'update_venue_settings', { p_variance_alert_iqd: 1 })).error?.message).toBe(
        'FORBIDDEN',
      );
      expect((await setThreshold(-1)).error?.message).toBe('SETTINGS_INVALID');
      expect((await setThreshold(3000)).error).toBeNull();
      expect(await sql(`select variance_alert_iqd::int as v from venue_settings where venue_id = $1`, [VENUE_ID])).toEqual([
        { v: 3000 },
      ]);
    });

    it('a close at or over the threshold is audited; under it is not', async () => {
      expect((await setThreshold(3000)).error).toBeNull();
      const short = await shift(cashier, 10000);
      expect((await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 7000 })).error).toBeNull();
      expect((await alerts(short.id)).map((a) => a.after)).toEqual([
        expect.objectContaining({ variance: -3000, threshold: 3000, expected_cash: 10000, counted_cash: 7000 }),
      ]);

      const fine = await shift(cashier, 10000);
      expect((await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 12999 })).error).toBeNull();
      expect(await alerts(fine.id)).toHaveLength(0);

      // close_till_shift_for alerts too.
      const other = await shift(cashier, 0);
      const closed = await appRpc(manager.client, 'close_till_shift_for', { p_shift_id: other.id, p_counted_cash: 4000 });
      expect(closed.error).toBeNull();
      expect(await alerts(other.id)).toHaveLength(1);
    });

    it('shift_variances lists closed shifts in range with the alert flag; manager and owner only', async () => {
      expect((await setThreshold(3000)).error).toBeNull();
      const s1 = await shift(cashier, 1000);
      await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 6000 });
      const s2 = await shift(cashier, 1000);
      await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 1000 });
      const open = await shift(cashier, 1000);

      const [{ today }] = (await sql<{ today: string }>(`select app.business_date()::text as today`)) as [
        { today: string },
      ];
      const { data, error } = await appRpc(manager.client, 'shift_variances', { p_from: today, p_to: today });
      expect(error).toBeNull();
      const out = data as { from: string; to: string; threshold: number; shifts: Record<string, unknown>[] };
      expect(out).toMatchObject({ from: today, to: today, threshold: 3000 });
      const byId = new Map(out.shifts.map((r) => [r.shift_id, r]));
      expect(byId.get(s1.id)).toEqual({
        shift_id: s1.id,
        staff_id: cashier.id,
        staff_name: 'Test cashier',
        device_id: s1.device,
        opened_at: expect.any(String),
        closed_at: expect.any(String),
        opening_float: 1000,
        expected_cash: 1000,
        counted_cash: 6000,
        variance: 5000,
        alert: true,
      });
      expect(byId.get(s2.id)).toMatchObject({ variance: 0, alert: false });
      expect(byId.has(open.id)).toBe(false);
      await appRpc(cashier.client, 'close_till_shift', { p_counted_cash: 1000 });

      expect((await appRpc(owner.client, 'shift_variances', { p_from: today, p_to: today })).error).toBeNull();
      expect((await appRpc(cashier.client, 'shift_variances', { p_from: today, p_to: today })).error?.message).toBe(
        'FORBIDDEN',
      );
      expect(
        (await appRpc(manager.client, 'shift_variances', { p_from: '2000-01-02', p_to: '2000-01-01' })).error?.message,
      ).toBe('INVALID_RANGE');
    });
  });

  describe('purge_housekeeping', () => {
    it('deletes old replays, attempts and expired grants; keeps fresh ones and the audit log', async () => {
      const tag = rnd();
      await sql(
        `insert into app.rpc_replays (key, result, created_at) values
           ($1, '{}', now() - interval '8 days'), ($2, '{}', now() - interval '6 days')`,
        [`old:${tag}`, `fresh:${tag}`],
      );
      const actor = manager.id;
      await sql(
        `insert into app.pin_attempts (actor_id, ok, at) values ($1, false, now() - interval '25 hours'),
                                                                ($1, false, now() - interval '23 hours')`,
        [actor],
      );
      await sql(
        `insert into app.pin_grants (actor_id, authorizer_id, action, created_at, expires_at) values
           ($1, $1, 'purge_old', now() - interval '2 days', now() - interval '2 days'),
           ($1, $1, 'purge_fresh', now(), now() + interval '2 minutes')`,
        [actor],
      );
      const auditBefore = await sql<{ n: string }>(`select count(*) as n from audit_log`);

      expect(isPermissionDenied((await appRpc(owner.client, 'purge_housekeeping')).error)).toBe(true);

      const { data, error } = await serviceClient().schema('app').rpc('purge_housekeeping');
      expect(error).toBeNull();
      const out = data as { rpc_replays: number; pin_attempts: number; pin_grants: number };
      expect(out.rpc_replays).toBeGreaterThanOrEqual(1);
      expect(out.pin_attempts).toBeGreaterThanOrEqual(1);
      expect(out.pin_grants).toBeGreaterThanOrEqual(1);

      expect(await sql(`select key from app.rpc_replays where key like $1 order by key`, [`%:${tag}`])).toEqual([
        { key: `fresh:${tag}` },
      ]);
      expect(
        await sql(`select 1 from app.pin_attempts where actor_id = $1 and at < now() - interval '1 day'`, [actor]),
      ).toHaveLength(0);
      expect(await sql(`select 1 from app.pin_attempts where actor_id = $1`, [actor])).not.toHaveLength(0);
      expect(
        await sql(`select action from app.pin_grants where actor_id = $1 and action like 'purge_%'`, [actor]),
      ).toEqual([{ action: 'purge_fresh' }]);
      const auditAfter = await sql<{ n: string }>(`select count(*) as n from audit_log`);
      expect(Number(auditAfter[0]!.n)).toBeGreaterThanOrEqual(Number(auditBefore[0]!.n));
    });

    it('is scheduled nightly with pg_cron', async () => {
      expect(
        await sql(`select schedule, command from cron.job where jobname = 'rop-purge-housekeeping'`),
      ).toEqual([{ schedule: '30 0 * * *', command: 'select app.purge_housekeeping()' }]);
    });
  });
});
