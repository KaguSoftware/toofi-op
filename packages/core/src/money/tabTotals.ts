import { iqd, MoneyError, type IQD } from './iqd';
import { splitEvenly } from './split';

/**
 * TypeScript mirror of the server's tab maths (migrations 0020, 0023 and 0081). The server is
 * always authoritative; this only lets the UI preview the same numbers. Every case in
 * __fixtures__/tab-totals-cases.json is run against both this file and the SQL.
 *
 *   rd(n, d)   = floor((2n + d) / 2d)            half-up division (app.round_div)
 *   live lines = lines not voided, in uuid order
 *   S = sum(line_total)
 *   each adjustment: discount_amount -> its stored amount (fixed when applied);
 *                    discount_percent -> rd(S * value, 10000), re-derived from the LIVE S
 *   D = min(sum of those, S)
 *   line i gets rd(D * cum_i, S) - rd(D * cum_(i-1), S) of D (0 when S = 0)
 *   tax = sum over tax rate r of rd(net_r * r, 10000 + r)   (prices include tax)
 *   total = S - D; due = max(total - paid, 0); refunds never change due.
 */

export interface TabLine {
  id: string;
  line_total: number;
  tax_rate_bps: number;
  voided: boolean;
}

export type AdjustmentKind = 'discount_percent' | 'discount_amount';

/**
 * A stored `tab_adjustments` row. value: basis points (percent) or IQD (amount); amount: what it
 * took off when applied. The totals count an amount row at its stored `amount` and re-derive a
 * percent row from the live subtotal, so a void lowers a percent discount.
 */
export interface TabAdjustment {
  kind: AdjustmentKind;
  value: number;
  amount: number;
}

export interface TabTotalsInput {
  lines: readonly TabLine[];
  adjustments: readonly TabAdjustment[];
  payments: readonly { amount: number }[];
  refunds: readonly { amount: number }[];
}

export interface TabTotals {
  subtotal: IQD;
  discount: IQD;
  tax: IQD;
  total: IQD;
  paid: IQD;
  refunded: IQD;
  due: IQD;
}

export interface LineDiscount {
  order_item_id: string;
  line_total: IQD;
  discount: IQD;
  amount: IQD;
}

/** Half-up integer division of non-negatives, in bigint so D * cum cannot lose precision. */
function rd(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

/** Postgres orders uuids by their 16 bytes, which is the order of the lowercase hex digits. */
function uuidKey(id: string): string {
  return id.toLowerCase().replace(/[^0-9a-f]/g, '');
}

function sumAmounts(rows: readonly { amount: number }[]): IQD {
  let total = 0;
  for (const r of rows) total = iqd(total + iqd(r.amount));
  return iqd(total);
}

function percentBps(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new MoneyError('INVALID_ARGUMENT', `a percent adjustment must be 0 to 10000 bps, got ${value}`);
  }
  return value;
}

/** app.tab_line_discounts: each live line, in uuid order, with its share of the discount. */
function lineDiscounts(
  lines: readonly TabLine[],
  adjustments: readonly TabAdjustment[],
): (LineDiscount & { tax_rate_bps: number })[] {
  const live = lines
    .filter((l) => !l.voided)
    .map((l) => {
      const rate = l.tax_rate_bps;
      if (!Number.isInteger(rate) || rate < 0 || rate > 10000) {
        throw new MoneyError('INVALID_ARGUMENT', `tax_rate_bps must be an integer in [0, 10000], got ${rate}`);
      }
      return { id: l.id, key: uuidKey(l.id), lt: iqd(l.line_total), rate };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (live.length === 0) return [];

  const sub = BigInt(live.reduce((s, l) => iqd(s + l.lt), 0));
  let totalAdj = 0n;
  for (const a of adjustments) {
    totalAdj += a.kind === 'discount_percent' ? rd(sub * BigInt(percentBps(a.value)), 10000n) : BigInt(iqd(a.amount));
  }
  const disc = totalAdj < sub ? totalAdj : sub;

  let cum = 0n;
  return live.map((l) => {
    const prev = cum;
    cum += BigInt(l.lt);
    const share = sub === 0n ? 0 : Number(rd(disc * cum, sub) - rd(disc * prev, sub));
    return {
      order_item_id: l.id,
      line_total: l.lt,
      discount: iqd(share),
      amount: iqd(l.lt - share),
      tax_rate_bps: l.rate,
    };
  });
}

/** app.compute_tab_totals. */
export function computeTabTotals(input: TabTotalsInput): TabTotals {
  const shares = lineDiscounts(input.lines, input.adjustments);

  let subtotal = 0;
  let discount = 0;
  const netByRate = new Map<number, bigint>();
  for (const s of shares) {
    subtotal += s.line_total;
    discount += s.discount;
    netByRate.set(s.tax_rate_bps, (netByRate.get(s.tax_rate_bps) ?? 0n) + BigInt(s.amount));
  }
  let tax = 0n;
  for (const [r, net] of netByRate) tax += rd(net * BigInt(r), BigInt(10000 + r));

  const total = iqd(subtotal - discount);
  const paid = sumAmounts(input.payments);
  return {
    subtotal: iqd(subtotal),
    discount: iqd(discount),
    tax: iqd(Number(tax)),
    total,
    paid,
    refunded: sumAmounts(input.refunds),
    due: iqd(Math.max(total - paid, 0)),
  };
}

/**
 * The amount app.apply_discount would store for a new discount: a percent is in basis points
 * of the subtotal, rounded half up; either kind is capped at what is left of the subtotal.
 * 0 means the server would refuse with NOTHING_TO_DISCOUNT. `totals` are the current ones
 * (computeTabTotals), whose discount already re-derives earlier percent rows from the live subtotal.
 * This is what apply_discount answers and stores at that moment; after a void, the totals re-derive a
 * percent row again, so pass the row on as {kind, value, amount} rather than as a fixed amount.
 */
export function discountAmount(
  kind: AdjustmentKind,
  value: number,
  totals: { subtotal: number; discount: number },
): IQD {
  if (!Number.isSafeInteger(value) || value <= 0 || (kind === 'discount_percent' && value > 10000)) {
    throw new MoneyError('INVALID_ARGUMENT', `INVALID_DISCOUNT: ${kind} ${String(value)}`);
  }
  const subtotal = iqd(totals.subtotal);
  const left = subtotal - iqd(totals.discount);
  const amount = kind === 'discount_percent' ? Number(rd(BigInt(subtotal) * BigInt(value), 10000n)) : value;
  return iqd(Math.max(Math.min(amount, left), 0));
}

/** app.split_evenly: 1 to 100 shares of what is due. */
export function splitTabEvenly(due: number, n: number): { due: IQD; shares: IQD[] } {
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new MoneyError('INVALID_ARGUMENT', `INVALID_SPLIT: ${String(n)} people`);
  }
  return { due: iqd(due), shares: splitEvenly(due, n) };
}

/**
 * app.split_by_item: the chosen live lines, in uuid order, each net of its discount share.
 * The amount is capped at what is due. Payments are not tied to lines, so a line paid in an
 * earlier split is not excluded: the till keeps track of which lines it has split off.
 */
export function splitByItem(
  input: TabTotalsInput,
  orderItemIds: readonly string[],
): { amount: IQD; due: IQD; lines: LineDiscount[] } {
  if (orderItemIds.length === 0) {
    throw new MoneyError('INVALID_ARGUMENT', 'INVALID_SPLIT: no lines chosen');
  }
  const { due } = computeTabTotals(input);
  const wanted = new Set(orderItemIds.map(uuidKey));
  const lines = lineDiscounts(input.lines, input.adjustments)
    .filter((l) => wanted.has(uuidKey(l.order_item_id)))
    .map(({ order_item_id, line_total, discount, amount }) => ({ order_item_id, line_total, discount, amount }));
  if (lines.length !== wanted.size) {
    throw new MoneyError('INVALID_ARGUMENT', 'LINE_NOT_ON_TAB');
  }
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  return { amount: iqd(Math.min(sum, due)), due, lines };
}

/**
 * The change app.settle_tab records. Cash: tendered - amount, or null when the server would
 * refuse with TENDERED_TOO_LOW. Card: tendered is ignored and change is 0.
 */
export function computeChange(method: 'cash' | 'card', amount: number, tendered: number | null): IQD | null {
  const a = iqd(amount);
  if (method === 'card') return iqd(0);
  if (tendered === null || iqd(tendered) < a) return null;
  return iqd(tendered - a);
}
