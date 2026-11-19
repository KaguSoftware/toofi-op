/**
 * Venue settings and staff admin SQL functions (migration 0063): owner only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  isForbidden,
  sql,
  stackAvailable,
  uniquePin,
  type TestStaff,
} from './helpers';
import { NO_ROW } from './rls-matrix';

const up = await stackAvailable();

describe.skipIf(!up)('catalog admin: venue settings and staff', () => {
  let owner: TestStaff;
  let manager: TestStaff;
  let waiter: TestStaff;
  let cashier: TestStaff;
  let target: TestStaff;

  beforeAll(async () => {
    owner = await createStaffOfRole('owner');
    manager = await createStaffOfRole('manager');
    waiter = await createStaffOfRole('waiter');
    cashier = await createStaffOfRole('cashier');
    target = await createStaffOfRole('waiter');
  });
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  describe('update_venue_settings', () => {
    it('owner updates the receipt text, service charge and name; null leaves a field alone', async () => {
      const before = (await sql<{ receipt_footer_ar: string }>(`select receipt_footer_ar from venue_settings`))[0]!;
      const r = await appRpc(owner.client, 'update_venue_settings', {
        p_venue_name: 'Test Venue',
        p_receipt_header_en: 'Hello',
        p_receipt_footer_en: 'Bye',
        p_service_charge_bps: 500,
      });
      expect(r.error).toBeNull();
      const row = (await sql(`select s.receipt_header_en, s.receipt_footer_en, s.receipt_footer_ar, s.service_charge_bps, v.name
                                from venue_settings s join venues v on v.id = s.venue_id`))[0];
      expect(row).toEqual({
        receipt_header_en: 'Hello',
        receipt_footer_en: 'Bye',
        receipt_footer_ar: before.receipt_footer_ar,
        service_charge_bps: 500,
        name: 'Test Venue',
      });
      const audit = await sql(`select 1 from audit_log where action = 'venue_settings.update' and actor_id = $1`, [owner.id]);
      expect(audit.length).toBeGreaterThan(0);
      // restore
      await appRpc(owner.client, 'update_venue_settings', { p_venue_name: 'Restaurant', p_service_charge_bps: 0 });
    });

    it('validates; refuses everyone but the owner', async () => {
      expect((await appRpc(owner.client, 'update_venue_settings', { p_service_charge_bps: 10001 })).error?.message).toBe('SETTINGS_INVALID');
      expect((await appRpc(owner.client, 'update_venue_settings', { p_service_charge_bps: -1 })).error?.message).toBe('SETTINGS_INVALID');
      expect((await appRpc(owner.client, 'update_venue_settings', { p_venue_name: ' ' })).error?.message).toBe('NAME_REQUIRED');
      for (const who of [manager, cashier, waiter]) {
        expect(isForbidden((await appRpc(who.client, 'update_venue_settings', { p_service_charge_bps: 1 })).error)).toBe(true);
      }
    });
  });

  describe('set_staff_role', () => {
    it('owner changes a role (audited with before and after); others are refused', async () => {
      const r = await appRpc(owner.client, 'set_staff_role', { p_staff_id: target.id, p_role: 'cashier' });
      expect(r.error).toBeNull();
      expect((await sql(`select role from staff where id = $1`, [target.id]))[0]).toEqual({ role: 'cashier' });
      const a = await sql<{ before: { role: string }; after: { role: string } }>(
        `select before, after from audit_log where action = 'staff.set_role' and entity_id = $1`, [target.id]);
      expect(a[0]).toEqual({ before: { role: 'waiter' }, after: { role: 'cashier' } });
      // The new role takes effect on the next call.
      expect(isForbidden((await appRpc(target.client, 'upsert_floor_area', { p_id: null, p_name_en: 'x', p_name_ar: 'س' })).error)).toBe(true);
      await appRpc(owner.client, 'set_staff_role', { p_staff_id: target.id, p_role: 'manager' });
      expect((await appRpc(target.client, 'upsert_floor_area', { p_id: null, p_name_en: '', p_name_ar: 'س' })).error?.message).toBe('NAME_REQUIRED');
      await appRpc(owner.client, 'set_staff_role', { p_staff_id: target.id, p_role: 'waiter' });

      for (const who of [manager, cashier, waiter]) {
        expect(isForbidden((await appRpc(who.client, 'set_staff_role', { p_staff_id: target.id, p_role: 'owner' })).error)).toBe(true);
      }
    });

    it('validates the target, the role and self-demotion', async () => {
      expect((await appRpc(owner.client, 'set_staff_role', { p_staff_id: NO_ROW, p_role: 'waiter' })).error?.message).toBe('STAFF_NOT_FOUND');
      expect((await appRpc(owner.client, 'set_staff_role', { p_staff_id: target.id, p_role: null })).error?.message).toBe('ROLE_REQUIRED');
      expect((await appRpc(owner.client, 'set_staff_role', { p_staff_id: owner.id, p_role: 'manager' })).error?.message).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect((await appRpc(owner.client, 'set_staff_role', { p_staff_id: owner.id, p_role: 'owner' })).error).toBeNull();
    });
  });

  describe('set_staff_active', () => {
    it('owner deactivates and reactivates; a deactivated member loses access; row stays readable', async () => {
      const t = await createStaffOfRole('waiter');
      expect((await appRpc(owner.client, 'set_staff_active', { p_staff_id: t.id, p_active: false })).error).toBeNull();
      expect((await appRpc(t.client, 'verify_own_pin', { p_pin: '000000' })).error?.message).toContain('FORBIDDEN');
      const read = await manager.client.from('staff').select('id, is_active').eq('id', t.id);
      expect(read.data).toEqual([{ id: t.id, is_active: false }]);
      expect((await appRpc(owner.client, 'set_staff_active', { p_staff_id: t.id, p_active: true })).error).toBeNull();
      expect((await appRpc(t.client, 'verify_own_pin', { p_pin: '000000' })).error).toBeNull();
    });

    it('an owner cannot deactivate themselves; validates; refuses others', async () => {
      expect((await appRpc(owner.client, 'set_staff_active', { p_staff_id: owner.id, p_active: false })).error?.message).toBe('CANNOT_DEACTIVATE_SELF');
      expect((await sql(`select is_active from staff where id = $1`, [owner.id]))[0]).toEqual({ is_active: true });
      expect((await appRpc(owner.client, 'set_staff_active', { p_staff_id: NO_ROW, p_active: false })).error?.message).toBe('STAFF_NOT_FOUND');
      expect((await appRpc(owner.client, 'set_staff_active', { p_staff_id: target.id, p_active: null })).error?.message).toBe('ACTIVE_FLAG_REQUIRED');
      for (const who of [manager, cashier, waiter]) {
        expect(isForbidden((await appRpc(who.client, 'set_staff_active', { p_staff_id: target.id, p_active: false })).error)).toBe(true);
      }
    });
  });

  describe('set_staff_pin', () => {
    it('owner sets another member\'s PIN, which then verifies as theirs; the PIN is never audited', async () => {
      const mgr = await createStaffOfRole('manager');
      const pin = uniquePin();
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: mgr.id, p_pin: pin })).error).toBeNull();
      const verify = await appRpc(mgr.client, 'verify_own_pin', { p_pin: pin });
      expect(verify.data).toEqual({ ok: true });
      const audit = await sql(`select * from audit_log where action = 'staff.pin_set_by_owner' and entity_id = $1`, [mgr.id]);
      expect(audit.length).toBe(1);
      expect(JSON.stringify(audit[0])).not.toContain(pin);
    });

    it('rejects malformed and weak PINs, unknown staff; refuses non-owners', async () => {
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: target.id, p_pin: '12ab' })).error?.message).toBe('PIN_FORMAT');
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: target.id, p_pin: '12345' })).error?.message).toBe('PIN_FORMAT');
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: target.id, p_pin: '111111' })).error?.message).toBe('PIN_WEAK');
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: target.id, p_pin: '123456' })).error?.message).toBe('PIN_WEAK');
      expect((await appRpc(owner.client, 'set_staff_pin', { p_staff_id: NO_ROW, p_pin: uniquePin() })).error?.message).toBe('STAFF_NOT_FOUND');
      for (const who of [manager, cashier, waiter]) {
        expect(isForbidden((await appRpc(who.client, 'set_staff_pin', { p_staff_id: target.id, p_pin: uniquePin() })).error)).toBe(true);
      }
    });
  });
});
