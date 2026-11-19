/**
 * Fixtures for the stock and analytics tests: menu items, ingredients, tabs, lines,
 * payments and refunds planted by direct SQL inside a test's own transaction
 * (withRollback), the way the money functions would write them. The money
 * functions are not called: the tables and their constraints are the contract.
 */
import type { Query } from './helpers';

let seq = 0;
const next = () => ++seq;

/** A day session (closed, so the one-open-day rule never bites) on a unique date. */
export async function daySession(q: Query, staffId: string): Promise<string> {
  const [row] = await q<{ id: string }>(
    `insert into day_sessions (business_date, opened_by, closed_by, closed_at)
     values (date '1990-01-01' + $2::int, $1, $1, now()) returning id`,
    [staffId, next()],
  );
  return row!.id;
}

export async function menuItem(q: Query, price: number, name = `Item ${next()}`): Promise<string> {
  const [tax] = await q<{ id: string }>(
    `insert into tax_groups (name, rate_bps) values ('VAT', 0) returning id`,
  );
  const [cat] = await q<{ id: string }>(
    `insert into menu_categories (name_en, name_ar) values ('Cat', 'فئة') returning id`,
  );
  const [item] = await q<{ id: string }>(
    `insert into menu_items (category_id, name_en, name_ar, price, tax_group_id)
     values ($1, $2, $2, $3, $4) returning id`,
    [cat!.id, name, price, tax!.id],
  );
  return item!.id;
}

export async function ingredient(
  q: Query,
  opts: { unit?: 'g' | 'ml' | 'pc'; cost?: number; reorder?: number } = {},
): Promise<string> {
  const [row] = await q<{ id: string }>(
    `insert into ingredients (name_en, name_ar, unit, cost_per_unit, reorder_point)
     values ($1, $1, $2, $3, $4) returning id`,
    [`Ing ${next()}`, opts.unit ?? 'g', opts.cost ?? 0, opts.reorder ?? 0],
  );
  return row!.id;
}

export async function recipeLine(q: Query, menuItemId: string, ingredientId: string, qty: number) {
  await q(`insert into recipe_lines (menu_item_id, ingredient_id, qty) values ($1, $2, $3)`, [
    menuItemId,
    ingredientId,
    qty,
  ]);
}

/** A stock movement written straight into the ledger (opening stock for a test). */
export async function seedStock(q: Query, ingredientId: string, qty: number, unitCost = 0) {
  await q(
    `insert into stock_movements (ingredient_id, kind, qty, unit_cost) values ($1, 'delivery', $2, $3)`,
    [ingredientId, qty, unitCost],
  );
}

export async function onHand(q: Query, ingredientId: string): Promise<number> {
  const [row] = await q<{ n: string }>(
    `select coalesce(sum(qty), 0) as n from stock_movements where ingredient_id = $1`,
    [ingredientId],
  );
  return Number(row!.n);
}

export interface TabOpts {
  openedAt?: string;
  covers?: number;
  status?: 'open' | 'settled' | 'void';
  waiterId?: string;
  mergedInto?: string;
}

export async function tab(q: Query, staffId: string, opts: TabOpts = {}): Promise<string> {
  const day = await daySession(q, staffId);
  const status = opts.status ?? 'open';
  const [row] = await q<{ id: string }>(
    `insert into tabs (day_session_id, waiter_id, covers, status, opened_at, closed_at,
                       merged_into_tab_id, idempotency_key)
     values ($1, $2, $3, $4::text::tab_status, coalesce($5::timestamptz, now()),
             case when $4::text = 'open' then null else coalesce($5::timestamptz, now()) end,
             $6, gen_random_uuid()::text)
     returning id`,
    [day, opts.waiterId ?? staffId, opts.covers ?? 1, status, opts.openedAt ?? null, opts.mergedInto ?? null],
  );
  return row!.id;
}

/** One order with one line of `qty` x `unitPrice` on the tab. Returns the line id. */
export async function line(
  q: Query,
  tabId: string,
  staffId: string,
  menuItemId: string,
  qty: number,
  unitPrice: number,
  at?: string,
): Promise<string> {
  const [order] = await q<{ id: string }>(
    `insert into orders (tab_id, placed_by, placed_at, idempotency_key)
     values ($1, $2, coalesce($3::timestamptz, now()), gen_random_uuid()::text) returning id`,
    [tabId, staffId, at ?? null],
  );
  const [item] = await q<{ id: string }>(
    `insert into order_items (order_id, tab_id, menu_item_id, name_en, name_ar, unit_price, qty,
                              line_total, tax_rate_bps, created_at)
     select $1, $2, m.id, m.name_en, m.name_ar, $3::bigint, $4::int, $3::bigint * $4::int, 0, coalesce($6::timestamptz, now())
       from menu_items m where m.id = $5
     returning id`,
    [order!.id, tabId, unitPrice, qty, menuItemId, at ?? null],
  );
  return item!.id;
}

/** Void a line: the contract the money phase follows. */
export async function voidLine(q: Query, lineId: string, staffId: string, at?: string) {
  await q(
    `update order_items set voided_at = coalesce($3::timestamptz, now()), voided_by = $2,
                            void_reason = 'test void'
      where id = $1`,
    [lineId, staffId, at ?? null],
  );
}

export async function payment(
  q: Query,
  tabId: string,
  staffId: string,
  amount: number,
  method: 'cash' | 'card' = 'cash',
  at?: string,
): Promise<string> {
  const [row] = await q<{ id: string }>(
    `insert into payments (tab_id, method, amount, tendered, change, taken_by, idempotency_key, created_at)
     values ($1, $2::text::payment_method, $3::bigint, case when $2::text = 'cash' then $3::bigint end, 0, $4,
             gen_random_uuid()::text, coalesce($5::timestamptz, now()))
     returning id`,
    [tabId, method, amount, staffId, at ?? null],
  );
  return row!.id;
}

export async function refund(
  q: Query,
  paymentId: string,
  tabId: string,
  staffId: string,
  amount: number,
  method: 'cash' | 'card' = 'cash',
  at?: string,
) {
  await q(
    `insert into refunds (payment_id, tab_id, amount, method, reason, refunded_by, created_at)
     values ($1, $2, $3, $4::payment_method, 'test refund', $5, coalesce($6::timestamptz, now()))`,
    [paymentId, tabId, amount, method, staffId, at ?? null],
  );
}

export async function discount(q: Query, tabId: string, staffId: string, amount: number, at?: string) {
  await q(
    `insert into tab_adjustments (tab_id, kind, value, amount, reason, applied_by, created_at)
     values ($1, 'discount_amount', $3::bigint, $3::bigint, 'test discount', $2, coalesce($4::timestamptz, now()))`,
    [tabId, staffId, amount, at ?? null],
  );
}

/**
 * Call an app.* function in the test's transaction (auth.uid() is the withRollback
 * user). Each call runs in a savepoint, so a refused call rolls back only itself and
 * the test can go on, as a separate RPC would.
 */
export async function call<T = Record<string, unknown>>(
  q: Query,
  fn: string,
  args: unknown[] = [],
  casts: string[] = [],
): Promise<T> {
  const params = args.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ''}`).join(', ');
  await q('savepoint rop_call');
  try {
    const [row] = await q<{ r: T }>(`select app.${fn}(${params}) as r`, args);
    await q('release savepoint rop_call');
    return row!.r;
  } catch (e) {
    await q('rollback to savepoint rop_call');
    throw e;
  }
}
