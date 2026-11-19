/**
 * Table access: anon sees nothing, a signed-in non-staff user sees nothing, staff
 * of the venue can select, audit_log and other people's till shifts are for
 * managers and owners, and nobody can write a table directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STAFF_ROLES, type StaffRole } from '@rop/core';
import {
  anonClient,
  cleanupStaff,
  createOutsider,
  createStaffOfRole,
  endDb,
  isPermissionDenied,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';

const up = await stackAvailable();

/** Every table in the schema contract (docs/SPEC.md). */
const TABLES = [
  'venues',
  'venue_settings',
  'staff',
  'audit_log',
  'floor_areas',
  'dining_tables',
  'tax_groups',
  'menu_categories',
  'menu_items',
  'modifier_groups',
  'modifiers',
  'menu_item_modifier_groups',
  'day_sessions',
  'tabs',
  'orders',
  'order_items',
  'order_item_modifiers',
  'tab_adjustments',
  'payments',
  'refunds',
  'till_shifts',
  'drawer_events',
  'ingredients',
  'recipe_lines',
  'suppliers',
  'deliveries',
  'delivery_lines',
  'stock_counts',
  'stock_count_lines',
  'stock_movements',
] as const;

/** The column list a client may select (staff.pin_hash and stock_count_lines.expected are not readable). */
const columnsOf = (table: string) =>
  table === 'staff'
    ? 'id, venue_id, full_name, role, is_active, created_at'
    : table === 'stock_count_lines'
      ? 'id, venue_id, count_id, ingredient_id, counted, created_at'
      : '*';

describe.skipIf(!up)('RLS and grants', () => {
  const staff = {} as Record<StaffRole, TestStaff>;
  let outsider: SupabaseClient;
  let probeArea = '';

  beforeAll(async () => {
    for (const role of STAFF_ROLES) staff[role] = await createStaffOfRole(role);
    outsider = (await createOutsider()).client;
    const [area] = await sql<{ id: string }>(
      `insert into floor_areas (name_en, name_ar) values ('RLS probe', 'فحص') returning id`,
    );
    probeArea = area?.id ?? '';
    // A till shift of the cashier, and an audit row, for the role-restricted reads.
    await sql(`insert into till_shifts (staff_id, device_id, opening_float) values ($1, $2, 0)`, [
      staff.cashier.id,
      `RLS-${Date.now()}`,
    ]);
    await sql(`insert into audit_log (action, entity) values ('rls.probe', 'test')`);
  });

  afterAll(async () => {
    await sql(`delete from floor_areas where id = $1`, [probeArea]);
    await sql(`update till_shifts set closed_at = now(), closed_by = staff_id, counted_cash = 0,
                      expected_cash = 0, variance = 0
                where staff_id = $1 and closed_at is null`, [staff.cashier.id]);
    await cleanupStaff();
    await endDb();
  });

  it('every table has RLS enabled', async () => {
    const rows = await sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'app') and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  for (const table of TABLES) {
    it(`${table}: anon is refused outright`, async () => {
      const { data, error } = await anonClient().from(table).select(columnsOf(table)).limit(1);
      expect(isPermissionDenied(error), error?.message ?? `got ${JSON.stringify(data)}`).toBe(true);
    });

    it(`${table}: a signed-in non-staff user sees no rows`, async () => {
      const { data, error } = await outsider.from(table).select(columnsOf(table)).limit(1);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`${table}: no role can insert, update or delete directly`, async () => {
      for (const role of STAFF_ROLES) {
        const c = staff[role].client;
        const ins = await c.from(table).insert({});
        expect(isPermissionDenied(ins.error), `${role} insert: ${ins.error?.message}`).toBe(true);
        const upd = await c.from(table).update({ created_at: new Date().toISOString() }).eq('created_at', '1999-01-01');
        expect(isPermissionDenied(upd.error), `${role} update: ${upd.error?.message}`).toBe(true);
        const del = await c.from(table).delete().eq('created_at', '1999-01-01');
        expect(isPermissionDenied(del.error), `${role} delete: ${del.error?.message}`).toBe(true);
      }
    });
  }

  it('every staff role can select venue rows (floor_areas probe, venues, staff)', async () => {
    for (const role of STAFF_ROLES) {
      const c = staff[role].client;
      const areas = await c.from('floor_areas').select('id').eq('id', probeArea);
      expect(areas.error, role).toBeNull();
      expect(areas.data, role).toHaveLength(1);
      const venues = await c.from('venues').select('id');
      expect(venues.data, role).toHaveLength(1);
      const people = await c.from('staff').select('id').eq('id', staff.owner.id);
      expect(people.data, role).toHaveLength(1);
    }
  });

  it('audit_log is readable by managers and owners only', async () => {
    for (const role of STAFF_ROLES) {
      const { data, error } = await staff[role].client.from('audit_log').select('id').eq('action', 'rls.probe');
      expect(error, role).toBeNull();
      expect((data ?? []).length > 0, role).toBe(role === 'manager' || role === 'owner');
    }
  });

  it('a till shift is readable by its own cashier and by managers, not by other staff', async () => {
    const visible = async (role: StaffRole) =>
      ((await staff[role].client.from('till_shifts').select('id').eq('staff_id', staff.cashier.id)).data ?? [])
        .length > 0;
    expect(await visible('cashier')).toBe(true);
    expect(await visible('manager')).toBe(true);
    expect(await visible('owner')).toBe(true);
    expect(await visible('waiter')).toBe(false);
  });

  it('a deactivated staff member sees nothing', async () => {
    const leaver = await createStaffOfRole('manager');
    await sql(`update staff set is_active = false where id = $1`, [leaver.id]);
    const { data } = await leaver.client.from('floor_areas').select('id').eq('id', probeArea);
    expect(data).toEqual([]);
  });
});
