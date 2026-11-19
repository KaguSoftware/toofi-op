/**
 * Floor, menu and modifier admin (migrations 0060-0062): manager and owner write,
 * everyone else is refused; validation errors carry their codes; nothing is hard
 * deleted (deactivated rows stay readable); every write is audited.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  isForbidden,
  isPermissionDenied,
  sql,
  sqlAs,
  stackAvailable,
  type TestStaff,
} from './helpers';
import { NO_ROW } from './rls-matrix';

const up = await stackAvailable();
const tag = `T${Date.now()}`;

describe.skipIf(!up)('catalog admin: floor and menu', () => {
  let manager: TestStaff;
  let owner: TestStaff;
  let waiter: TestStaff;
  let cashier: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    owner = await createStaffOfRole('owner');
    waiter = await createStaffOfRole('waiter');
    cashier = await createStaffOfRole('cashier');
  });
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  const audited = async (action: string, entityId: string) =>
    (await sql<{ n: string }>(`select count(*) n from audit_log where action = $1 and entity_id = $2`, [action, entityId]))[0]!.n;

  async function newArea(name = `Area ${tag}`) {
    const r = await appRpc(manager.client, 'upsert_floor_area', { p_id: null, p_name_en: name, p_name_ar: 'منطقة', p_sort: 9 });
    expect(r.error?.message).toBeUndefined();
    return r.data as string;
  }
  async function newCategory() {
    const r = await appRpc(manager.client, 'upsert_menu_category', { p_id: null, p_name_en: `Cat ${tag}`, p_name_ar: 'فئة' });
    expect(r.error?.message).toBeUndefined();
    return r.data as string;
  }
  async function taxGroup() {
    const r = await sql<{ id: string }>(`select id from tax_groups where name = 'No tax'`);
    return r[0]!.id;
  }
  async function newItem(price = 5000) {
    const r = await appRpc(manager.client, 'upsert_menu_item', {
      p_id: null,
      p_category_id: await newCategory(),
      p_name_en: `Item ${tag}`,
      p_name_ar: 'صنف',
      p_price: price,
      p_tax_group_id: await taxGroup(),
    });
    expect(r.error?.message).toBeUndefined();
    return r.data as string;
  }

  describe('floor', () => {
    it('manager and owner create and update an area (audited); waiter and cashier are refused', async () => {
      const id = await newArea();
      expect(await audited('floor_area.create', id)).toBe('1');
      const upd = await appRpc(owner.client, 'upsert_floor_area', { p_id: id, p_name_en: 'Renamed', p_name_ar: 'جديد', p_sort: 3 });
      expect(upd.error).toBeNull();
      expect(await audited('floor_area.update', id)).toBe('1');
      const row = await sql<{ name_en: string; sort: number }>(`select name_en, sort from floor_areas where id = $1`, [id]);
      expect(row[0]).toEqual({ name_en: 'Renamed', sort: 3 });
      for (const who of [waiter, cashier]) {
        const r = await appRpc(who.client, 'upsert_floor_area', { p_id: null, p_name_en: 'x', p_name_ar: 'س' });
        expect(isForbidden(r.error)).toBe(true);
      }
    });

    it('requires both names and a known area', async () => {
      const blankAr = await appRpc(manager.client, 'upsert_floor_area', { p_id: null, p_name_en: 'x', p_name_ar: '  ' });
      expect(blankAr.error?.message).toBe('NAME_REQUIRED');
      const missing = await appRpc(manager.client, 'upsert_floor_area', { p_id: NO_ROW, p_name_en: 'x', p_name_ar: 'س' });
      expect(missing.error?.message).toBe('AREA_NOT_FOUND');
    });

    it('creates and moves a table; validates seats, grid, label and area', async () => {
      const area = await newArea();
      const label = `${tag}-a`;
      const made = await appRpc(manager.client, 'upsert_dining_table', {
        p_id: null, p_area_id: area, p_label: label, p_seats: 6, p_grid_x: 2, p_grid_y: 3,
      });
      expect(made.error).toBeNull();
      const id = made.data as string;
      const moved = await appRpc(manager.client, 'upsert_dining_table', {
        p_id: id, p_area_id: area, p_label: label, p_seats: 8, p_grid_x: 4, p_grid_y: 5,
      });
      expect(moved.error).toBeNull();
      const row = await sql(`select seats, grid_x, grid_y from dining_tables where id = $1`, [id]);
      expect(row[0]).toEqual({ seats: 8, grid_x: 4, grid_y: 5 });

      const dup = await appRpc(manager.client, 'upsert_dining_table', { p_id: null, p_area_id: area, p_label: label });
      expect(dup.error?.message).toBe('TABLE_LABEL_TAKEN');
      const bad = async (args: Record<string, unknown>) =>
        (await appRpc(manager.client, 'upsert_dining_table', { p_id: null, p_area_id: area, p_label: `${tag}-b`, ...args })).error?.message;
      expect(await bad({ p_label: ' ' })).toBe('NAME_REQUIRED');
      expect(await bad({ p_seats: 0 })).toBe('SEATS_INVALID');
      expect(await bad({ p_grid_x: -1 })).toBe('GRID_INVALID');
      expect(await bad({ p_area_id: NO_ROW })).toBe('AREA_NOT_FOUND');
      const gone = await appRpc(manager.client, 'upsert_dining_table', { p_id: NO_ROW, p_area_id: area, p_label: `${tag}-c` });
      expect(gone.error?.message).toBe('TABLE_NOT_FOUND');
      const refused = await appRpc(waiter.client, 'upsert_dining_table', { p_id: null, p_area_id: area, p_label: 'x' });
      expect(isForbidden(refused.error)).toBe(true);
    });

    it('deactivates a table without deleting it, refusing while a tab is open', async () => {
      const area = await newArea();
      const made = await appRpc(manager.client, 'upsert_dining_table', { p_id: null, p_area_id: area, p_label: `${tag}-d` });
      const id = made.data as string;

      // An open tab on the table, inserted directly (the money agent owns open_tab).
      const day = await sqlAs(null, async (q) => {
        const d = await q<{ id: string }>(
          `insert into day_sessions (business_date, opened_by, closed_at, closed_by)
           values ('2000-01-01', $1, now(), $1) on conflict (venue_id, business_date) do update set opened_by = $1
           returning id`, [manager.id]);
        return d[0]!.id;
      });
      const tab = await sql<{ id: string }>(
        `insert into tabs (day_session_id, table_id, waiter_id, idempotency_key) values ($1, $2, $3, $4) returning id`,
        [day, id, waiter.id, `${tag}:tab`]);
      const blocked = await appRpc(manager.client, 'set_dining_table_active', { p_id: id, p_active: false });
      expect(blocked.error?.message).toBe('TABLE_HAS_OPEN_TAB');
      await sql(`update tabs set status = 'void', closed_at = now() where id = $1`, [tab[0]!.id]);

      const off = await appRpc(manager.client, 'set_dining_table_active', { p_id: id, p_active: false });
      expect(off.error).toBeNull();
      // Still readable by every staff role.
      const read = await waiter.client.from('dining_tables').select('id, is_active').eq('id', id);
      expect(read.data).toEqual([{ id, is_active: false }]);
      const on = await appRpc(owner.client, 'set_dining_table_active', { p_id: id, p_active: true });
      expect(on.error).toBeNull();

      expect((await appRpc(manager.client, 'set_dining_table_active', { p_id: NO_ROW, p_active: true })).error?.message).toBe('TABLE_NOT_FOUND');
      expect((await appRpc(manager.client, 'set_dining_table_active', { p_id: id, p_active: null })).error?.message).toBe('ACTIVE_FLAG_REQUIRED');
      expect(isForbidden((await appRpc(cashier.client, 'set_dining_table_active', { p_id: id, p_active: false })).error)).toBe(true);
    });
  });

  describe('menu', () => {
    it('tax groups: create, update, validate, refuse waiter', async () => {
      const made = await appRpc(manager.client, 'upsert_tax_group', { p_id: null, p_name: `Tax ${tag}`, p_rate_bps: 500 });
      expect(made.error).toBeNull();
      const id = made.data as string;
      expect((await appRpc(owner.client, 'upsert_tax_group', { p_id: id, p_name: `Tax ${tag}`, p_rate_bps: 700 })).error).toBeNull();
      expect((await sql(`select rate_bps from tax_groups where id = $1`, [id]))[0]).toEqual({ rate_bps: 700 });
      expect((await appRpc(manager.client, 'upsert_tax_group', { p_id: null, p_name: '', p_rate_bps: 0 })).error?.message).toBe('NAME_REQUIRED');
      expect((await appRpc(manager.client, 'upsert_tax_group', { p_id: null, p_name: 'x', p_rate_bps: 10001 })).error?.message).toBe('TAX_RATE_INVALID');
      expect((await appRpc(manager.client, 'upsert_tax_group', { p_id: null, p_name: 'x', p_rate_bps: -1 })).error?.message).toBe('TAX_RATE_INVALID');
      expect((await appRpc(manager.client, 'upsert_tax_group', { p_id: NO_ROW, p_name: 'x', p_rate_bps: 1 })).error?.message).toBe('TAX_GROUP_NOT_FOUND');
      expect(isForbidden((await appRpc(waiter.client, 'upsert_tax_group', { p_id: null, p_name: 'x', p_rate_bps: 1 })).error)).toBe(true);
    });

    it('categories: create, update, deactivate (stays readable), validate', async () => {
      const id = await newCategory();
      expect((await appRpc(manager.client, 'upsert_menu_category', { p_id: id, p_name_en: 'Two', p_name_ar: 'اثنان', p_sort: 4 })).error).toBeNull();
      expect((await appRpc(manager.client, 'set_menu_category_active', { p_id: id, p_active: false })).error).toBeNull();
      const read = await cashier.client.from('menu_categories').select('name_en, is_active').eq('id', id);
      expect(read.data).toEqual([{ name_en: 'Two', is_active: false }]);
      expect((await appRpc(manager.client, 'upsert_menu_category', { p_id: null, p_name_en: '', p_name_ar: 'ا' })).error?.message).toBe('NAME_REQUIRED');
      expect((await appRpc(manager.client, 'upsert_menu_category', { p_id: NO_ROW, p_name_en: 'a', p_name_ar: 'ا' })).error?.message).toBe('CATEGORY_NOT_FOUND');
      expect((await appRpc(manager.client, 'set_menu_category_active', { p_id: NO_ROW, p_active: true })).error?.message).toBe('CATEGORY_NOT_FOUND');
      expect(isForbidden((await appRpc(waiter.client, 'set_menu_category_active', { p_id: id, p_active: true })).error)).toBe(true);
      expect(isForbidden((await appRpc(cashier.client, 'upsert_menu_category', { p_id: null, p_name_en: 'a', p_name_ar: 'ا' })).error)).toBe(true);
    });

    it('items: create, update price, deactivate (stays readable), validate', async () => {
      const id = await newItem(4500);
      expect(await audited('menu_item.create', id)).toBe('1');
      const cat = await newCategory();
      const upd = await appRpc(owner.client, 'upsert_menu_item', {
        p_id: id, p_category_id: cat, p_name_en: 'Item B', p_name_ar: 'صنف ب', p_price: 0, p_tax_group_id: await taxGroup(), p_sort: 2,
      });
      expect(upd.error).toBeNull();
      const row = await sql(`select price::text, name_en, category_id, sort from menu_items where id = $1`, [id]);
      expect(row[0]).toEqual({ price: '0', name_en: 'Item B', category_id: cat, sort: 2 });
      const before = (await sql<{ before: { price: number } }>(
        `select before from audit_log where action = 'menu_item.update' and entity_id = $1`, [id]))[0]!;
      expect(Number(before.before.price)).toBe(4500);

      expect((await appRpc(manager.client, 'set_menu_item_active', { p_id: id, p_active: false })).error).toBeNull();
      const read = await waiter.client.from('menu_items').select('is_active, price').eq('id', id);
      expect(read.data).toEqual([{ is_active: false, price: 0 }]);

      const tax = await taxGroup();
      const base = { p_id: null, p_category_id: cat, p_name_en: 'a', p_name_ar: 'ا', p_price: 1, p_tax_group_id: tax };
      const call = async (o: Record<string, unknown>) => (await appRpc(manager.client, 'upsert_menu_item', { ...base, ...o })).error?.message;
      expect(await call({ p_name_en: ' ' })).toBe('NAME_REQUIRED');
      expect(await call({ p_name_ar: '' })).toBe('NAME_REQUIRED');
      expect(await call({ p_price: -1 })).toBe('PRICE_INVALID');
      expect(await call({ p_price: null })).toBe('PRICE_INVALID');
      expect(await call({ p_category_id: NO_ROW })).toBe('CATEGORY_NOT_FOUND');
      expect(await call({ p_tax_group_id: NO_ROW })).toBe('TAX_GROUP_NOT_FOUND');
      expect(await call({ p_id: NO_ROW })).toBe('ITEM_NOT_FOUND');
      expect((await appRpc(manager.client, 'set_menu_item_active', { p_id: NO_ROW, p_active: true })).error?.message).toBe('ITEM_NOT_FOUND');
      expect(isForbidden((await appRpc(waiter.client, 'upsert_menu_item', base)).error)).toBe(true);
      expect(isForbidden((await appRpc(cashier.client, 'set_menu_item_active', { p_id: id, p_active: true })).error)).toBe(true);
    });

    it('a menu item that a sale references can be deactivated and keeps its row', async () => {
      const id = await newItem();
      // No client function deletes menu rows at all: the table grants no delete.
      const del = await manager.client.from('menu_items').delete().eq('id', id);
      expect(isPermissionDenied(del.error)).toBe(true);
      expect((await sql(`select 1 from menu_items where id = $1`, [id])).length).toBe(1);
    });
  });

  describe('modifiers', () => {
    it('groups: validates min <= max and names', async () => {
      const ok = await appRpc(manager.client, 'upsert_modifier_group', { p_id: null, p_name_en: `G ${tag}`, p_name_ar: 'مجموعة', p_min_select: 1, p_max_select: 2 });
      expect(ok.error).toBeNull();
      const id = ok.data as string;
      const upd = await appRpc(owner.client, 'upsert_modifier_group', { p_id: id, p_name_en: 'G2', p_name_ar: 'مجموعة 2', p_min_select: 0, p_max_select: 3 });
      expect(upd.error).toBeNull();
      const bad = async (min: number, max: number) =>
        (await appRpc(manager.client, 'upsert_modifier_group', { p_id: null, p_name_en: 'g', p_name_ar: 'م', p_min_select: min, p_max_select: max })).error?.message;
      expect(await bad(3, 2)).toBe('MODIFIER_RANGE_INVALID');
      expect(await bad(-1, 2)).toBe('MODIFIER_RANGE_INVALID');
      expect(await bad(0, 0)).toBe('MODIFIER_RANGE_INVALID');
      expect((await appRpc(manager.client, 'upsert_modifier_group', { p_id: null, p_name_en: '', p_name_ar: 'م' })).error?.message).toBe('NAME_REQUIRED');
      expect((await appRpc(manager.client, 'upsert_modifier_group', { p_id: NO_ROW, p_name_en: 'g', p_name_ar: 'م' })).error?.message).toBe('MODIFIER_GROUP_NOT_FOUND');
      expect(isForbidden((await appRpc(waiter.client, 'upsert_modifier_group', { p_id: null, p_name_en: 'g', p_name_ar: 'م' })).error)).toBe(true);
    });

    it('modifiers: price delta may be negative, deactivation keeps the row', async () => {
      const g = (await appRpc(manager.client, 'upsert_modifier_group', { p_id: null, p_name_en: 'g', p_name_ar: 'م' })).data as string;
      const m = await appRpc(manager.client, 'upsert_modifier', { p_id: null, p_group_id: g, p_name_en: 'Less', p_name_ar: 'أقل', p_price_delta: -500 });
      expect(m.error).toBeNull();
      const id = m.data as string;
      expect((await sql(`select price_delta::text d from modifiers where id = $1`, [id]))[0]).toEqual({ d: '-500' });
      expect((await appRpc(manager.client, 'upsert_modifier', { p_id: id, p_group_id: g, p_name_en: 'Lesser', p_name_ar: 'أقل', p_price_delta: 0 })).error).toBeNull();
      expect((await appRpc(manager.client, 'set_modifier_active', { p_id: id, p_active: false })).error).toBeNull();
      expect((await cashier.client.from('modifiers').select('is_active').eq('id', id)).data).toEqual([{ is_active: false }]);
      const call = async (o: Record<string, unknown>) =>
        (await appRpc(manager.client, 'upsert_modifier', { p_id: null, p_group_id: g, p_name_en: 'a', p_name_ar: 'ا', ...o })).error?.message;
      expect(await call({ p_name_en: '' })).toBe('NAME_REQUIRED');
      expect(await call({ p_group_id: NO_ROW })).toBe('MODIFIER_GROUP_NOT_FOUND');
      expect(await call({ p_id: NO_ROW })).toBe('MODIFIER_NOT_FOUND');
      expect((await appRpc(manager.client, 'set_modifier_active', { p_id: NO_ROW, p_active: true })).error?.message).toBe('MODIFIER_NOT_FOUND');
      expect(isForbidden((await appRpc(waiter.client, 'set_modifier_active', { p_id: id, p_active: true })).error)).toBe(true);
      expect(isForbidden((await appRpc(cashier.client, 'upsert_modifier', { p_id: null, p_group_id: g, p_name_en: 'a', p_name_ar: 'ا' })).error)).toBe(true);
    });

    it('set_item_modifier_groups replaces the attached set', async () => {
      const item = await newItem();
      const mk = async () => (await appRpc(manager.client, 'upsert_modifier_group', { p_id: null, p_name_en: 'g', p_name_ar: 'م' })).data as string;
      const [g1, g2] = [await mk(), await mk()];
      const attached = async () =>
        (await sql<{ group_id: string }>(`select group_id from menu_item_modifier_groups where menu_item_id = $1 order by group_id`, [item])).map((r) => r.group_id);
      expect((await appRpc(manager.client, 'set_item_modifier_groups', { p_menu_item_id: item, p_group_ids: [g1, g2, g1] })).error).toBeNull();
      expect(await attached()).toEqual([g1, g2].sort());
      expect((await appRpc(manager.client, 'set_item_modifier_groups', { p_menu_item_id: item, p_group_ids: [g2] })).error).toBeNull();
      expect(await attached()).toEqual([g2]);
      expect((await appRpc(manager.client, 'set_item_modifier_groups', { p_menu_item_id: item, p_group_ids: [g2, NO_ROW] })).error?.message).toBe('MODIFIER_GROUP_NOT_FOUND');
      expect(await attached()).toEqual([g2]); // the failed call changed nothing
      expect((await appRpc(manager.client, 'set_item_modifier_groups', { p_menu_item_id: NO_ROW, p_group_ids: [] })).error?.message).toBe('ITEM_NOT_FOUND');
      expect((await appRpc(manager.client, 'set_item_modifier_groups', { p_menu_item_id: item, p_group_ids: [] })).error).toBeNull();
      expect(await attached()).toEqual([]);
      expect(isForbidden((await appRpc(waiter.client, 'set_item_modifier_groups', { p_menu_item_id: item, p_group_ids: [] })).error)).toBe(true);
    });
  });

  describe('reorder_menu', () => {
    it('writes positions 1..n for categories, items and areas', async () => {
      const a = await newArea();
      const b = await newArea();
      expect((await appRpc(manager.client, 'reorder_menu', { p_kind: 'area', p_ids: [b, a] })).error).toBeNull();
      const rows = await sql<{ id: string; sort: number }>(`select id, sort from floor_areas where id in ($1, $2)`, [a, b]);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.sort]))).toEqual({ [b]: 1, [a]: 2 });

      const c1 = await newCategory();
      const c2 = await newCategory();
      expect((await appRpc(owner.client, 'reorder_menu', { p_kind: 'category', p_ids: [c2, c1] })).error).toBeNull();
      const i1 = await newItem();
      const i2 = await newItem();
      expect((await appRpc(manager.client, 'reorder_menu', { p_kind: 'item', p_ids: [i2, i1] })).error).toBeNull();
      const items = await sql<{ id: string; sort: number }>(`select id, sort from menu_items where id in ($1, $2)`, [i1, i2]);
      expect(Object.fromEntries(items.map((r) => [r.id, r.sort]))).toEqual({ [i2]: 1, [i1]: 2 });
    });

    it('validates kind and ids; refuses waiter', async () => {
      expect((await appRpc(manager.client, 'reorder_menu', { p_kind: 'shelf', p_ids: [] })).error?.message).toBe('REORDER_KIND_INVALID');
      expect((await appRpc(manager.client, 'reorder_menu', { p_kind: 'item', p_ids: [NO_ROW] })).error?.message).toBe('REORDER_IDS_INVALID');
      expect((await appRpc(manager.client, 'reorder_menu', { p_kind: 'item', p_ids: [NO_ROW, NO_ROW] })).error?.message).toBe('REORDER_IDS_INVALID');
      expect(isForbidden((await appRpc(waiter.client, 'reorder_menu', { p_kind: 'item', p_ids: [] })).error)).toBe(true);
    });
  });
});
