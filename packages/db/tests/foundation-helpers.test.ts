/**
 * The role and venue helpers every function and policy builds on:
 * app.staff_role(), app.is_staff(...), app.current_venue(), app.business_date(...).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STAFF_ROLES, type StaffRole } from '@rop/core';
import {
  VENUE_ID,
  cleanupStaff,
  createOutsider,
  createStaffOfRole,
  endDb,
  sql,
  sqlAs,
  stackAvailable,
  type TestStaff,
} from './helpers';

const up = await stackAvailable();

describe.skipIf(!up)('role and venue helpers', () => {
  const staff = {} as Record<StaffRole, TestStaff>;
  let outsiderId = '';

  beforeAll(async () => {
    for (const role of STAFF_ROLES) staff[role] = await createStaffOfRole(role);
    outsiderId = (await createOutsider()).id;
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('the staff_role enum is exactly @rop/core STAFF_ROLES, in order', async () => {
    const rows = await sql<{ v: string }>(
      `select unnest(enum_range(null::staff_role))::text as v`,
    );
    expect(rows.map((r) => r.v)).toEqual([...STAFF_ROLES]);
  });

  it('app.staff_role() is the caller’s role, NULL for non-staff and anon', async () => {
    for (const role of STAFF_ROLES) {
      const [row] = await sqlAs(staff[role].id, (q) => q<{ r: string }>(`select app.staff_role() as r`));
      expect(row?.r).toBe(role);
    }
    const [outsider] = await sqlAs(outsiderId, (q) => q(`select app.staff_role() as r`));
    expect(outsider?.r).toBeNull();
    const [anon] = await sqlAs(null, (q) => q(`select app.staff_role() as r`));
    expect(anon?.r).toBeNull();
  });

  it('app.is_staff(...) is true only for the listed roles, and FALSE (never NULL) otherwise', async () => {
    const check = (uid: string | null) =>
      sqlAs(uid, (q) =>
        q<{ mgr: boolean | null; waiter: boolean | null }>(
          `select app.is_staff('manager', 'owner') as mgr, app.is_staff('waiter') as waiter`,
        ),
      );
    expect((await check(staff.manager.id))[0]).toEqual({ mgr: true, waiter: false });
    expect((await check(staff.owner.id))[0]).toEqual({ mgr: true, waiter: false });
    expect((await check(staff.waiter.id))[0]).toEqual({ mgr: false, waiter: true });
    expect((await check(outsiderId))[0]).toEqual({ mgr: false, waiter: false });
    expect((await check(null))[0]).toEqual({ mgr: false, waiter: false });
  });

  it('a deactivated staff member has no role', async () => {
    const leaver = await createStaffOfRole('manager');
    await sql(`update staff set is_active = false where id = $1`, [leaver.id]);
    const [row] = await sqlAs(leaver.id, (q) => q(`select app.staff_role() as r, app.is_staff('manager') as m`));
    expect(row).toEqual({ r: null, m: false });
  });

  it('app.current_venue() is the staff member’s venue, else the only venue', async () => {
    const [mine] = await sqlAs(staff.cashier.id, (q) => q(`select app.current_venue() as v`));
    expect(mine?.v).toBe(VENUE_ID);
    const [system] = await sqlAs(null, (q) => q(`select app.current_venue() as v`));
    expect(system?.v).toBe(VENUE_ID);
  });

  it('app.business_date() is the Asia/Baghdad date, not the UTC date', async () => {
    const [row] = await sqlAs(staff.manager.id, (q) =>
      q<{ late: string; early: string }>(
        `select app.business_date('2026-11-19T22:30:00Z')::text as late,
                app.business_date('2026-11-19T20:59:00Z')::text as early`,
      ),
    );
    // 22:30 UTC is 01:30 the next day in Baghdad (UTC+3); 20:59 UTC is 23:59 the same day.
    expect(row).toEqual({ late: '2026-11-20', early: '2026-11-19' });
  });
});
