/**
 * Fixtures for the money tests (backend-money): a small menu, tables, a fresh
 * business day and a manager PIN grant. Written as the superuser because the
 * catalog admin functions belong to another phase. Not a test file.
 */
import { appRpc, sql, testIdemKey, type TestStaff } from './helpers';

export interface Menu {
  /** 12,000 IQD, 10% tax, no modifiers. */
  burger: string;
  /** 1,500 IQD, 0% tax. */
  tea: string;
  /** 20,000 IQD, 10% tax; doneness (exactly 1) and extras (0 to 2). */
  steak: string;
  /** Inactive item. */
  soup: string;
  mod: { rare: string; wellDone: string; cheese: string; bacon: string; egg: string; foreign: string };
}

const rnd = () => Math.random().toString(36).slice(2, 8);

export async function makeMenu(): Promise<Menu> {
  const tag = rnd();
  const one = async (text: string, params: unknown[] = []) => {
    const rows = await sql<{ id: string }>(`${text} returning id`, params);
    return rows[0]!.id;
  };
  const tax10 = await one(`insert into tax_groups (name, rate_bps) values ($1, 1000)`, [`T10 ${tag}`]);
  const tax0 = await one(`insert into tax_groups (name, rate_bps) values ($1, 0)`, [`T0 ${tag}`]);
  const cat = await one(`insert into menu_categories (name_en, name_ar) values ($1, $1)`, [`Cat ${tag}`]);
  const item = (name: string, price: number, tax: string, active = true) =>
    one(
      `insert into menu_items (category_id, name_en, name_ar, price, tax_group_id, is_active)
       values ($1, $2, $3, $4, $5, $6)`,
      [cat, name, `${name} ar`, price, tax, active],
    );
  const burger = await item('Burger', 12000, tax10);
  const tea = await item('Tea', 1500, tax0);
  const steak = await item('Steak', 20000, tax10);
  const soup = await item('Soup', 5000, tax0, false);

  const group = (name: string, min: number, max: number) =>
    one(`insert into modifier_groups (name_en, name_ar, min_select, max_select) values ($1, $1, $2, $3)`, [
      `${name} ${tag}`,
      min,
      max,
    ]);
  const doneness = await group('Doneness', 1, 1);
  const extras = await group('Extras', 0, 2);
  const other = await group('Other', 0, 1);
  const mod = (g: string, name: string, delta: number, active = true) =>
    one(`insert into modifiers (group_id, name_en, name_ar, price_delta, is_active) values ($1, $2, $3, $4, $5)`, [
      g,
      name,
      `${name} ar`,
      delta,
      active,
    ]);
  const m = {
    rare: await mod(doneness, 'Rare', 0),
    wellDone: await mod(doneness, 'Well done', 0),
    cheese: await mod(extras, 'Cheese', 1000),
    bacon: await mod(extras, 'Bacon', 1500),
    egg: await mod(extras, 'Egg', 500, false),
    foreign: await mod(other, 'Foreign', 100),
  };
  await sql(`insert into menu_item_modifier_groups (menu_item_id, group_id) values ($1, $2), ($1, $3)`, [
    steak,
    doneness,
    extras,
  ]);
  return { burger, tea, steak, soup, mod: m };
}

/** A new active dining table with a unique label. */
export async function makeTable(): Promise<string> {
  const [area] = await sql<{ id: string }>(
    `insert into floor_areas (name_en, name_ar) values ('Hall', 'Hall') returning id`,
  );
  const [t] = await sql<{ id: string }>(`insert into dining_tables (area_id, label) values ($1, $2) returning id`, [
    area!.id,
    `T-${rnd()}${rnd()}`,
  ]);
  return t!.id;
}

/**
 * Leave the venue with exactly one open business day, opened by `manager` through
 * app.open_day. Earlier runs' open tabs are voided and their day closed directly,
 * and a session already using today's business date is moved out of the way.
 */
export async function openFreshDay(manager: TestStaff): Promise<string> {
  await sql(`update tabs set status = 'void', closed_at = now() where status = 'open'`);
  await sql(`update day_sessions set closed_at = now(), closed_by = opened_by where closed_at is null`);
  await sql(
    `update day_sessions set business_date = (select min(business_date) - 1 from day_sessions)
      where business_date = app.business_date()`,
  );
  const { data, error } = await appRpc(manager.client, 'open_day');
  if (error) throw new Error(`open_day failed: ${error.message}`);
  return (data as { day_session_id: string }).day_session_id;
}

/** A waiter (or anyone) obtains a manager PIN grant for `action`. */
export async function grantPin(actor: TestStaff, managerPin: string, action: string): Promise<void> {
  const { data, error } = await appRpc(actor.client, 'verify_manager_pin', { p_pin: managerPin, p_action: action });
  if (error || !(data as { ok: boolean }).ok) throw new Error(`verify_manager_pin failed: ${JSON.stringify(data)}`);
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  refunded: number;
  due: number;
}

/** Open a tab on a new table and return its id. */
export async function openTab(staff: TestStaff, covers = 2): Promise<string> {
  const table = await makeTable();
  const { data, error } = await appRpc(staff.client, 'open_tab', {
    p_table_id: table,
    p_covers: covers,
    p_idempotency_key: testIdemKey('tab'),
  });
  if (error) throw new Error(`open_tab failed: ${error.message}`);
  return (data as { tab_id: string }).tab_id;
}

export interface ItemInput {
  menu_item_id: string;
  qty: number;
  modifier_ids?: string[];
  note?: string;
}

/** Send items to a tab; returns the created line ids in input order. */
export async function addItems(staff: TestStaff, tabId: string, items: ItemInput[]): Promise<string[]> {
  const { data, error } = await appRpc(staff.client, 'add_items', {
    p_tab_id: tabId,
    p_items: items,
    p_idempotency_key: testIdemKey('order'),
  });
  if (error) throw new Error(`add_items failed: ${error.message}`);
  return (data as { lines: { id: string }[] }).lines.map((l) => l.id);
}

export async function totals(staff: TestStaff, tabId: string): Promise<Totals> {
  const { data, error } = await appRpc(staff.client, 'compute_tab_totals', { p_tab_id: tabId });
  if (error) throw new Error(`compute_tab_totals failed: ${error.message}`);
  return data as Totals;
}
