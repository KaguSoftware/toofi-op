// Pure till logic: change, quick tender notes, discount input, whether Pay is allowed,
// stable idempotency keys per payment attempt, and reading server results.
// The server owns every total; nothing here computes a bill.
import { localParts, wallTimeToUtc } from '@rop/core';
import { VENUE_TZ, asciiDigits } from '@rop/i18n';

export const IQD_NOTES = [250, 500, 1000, 5000, 10000, 25000, 50000] as const;
const BIGGEST_NOTE = 50000;

export type Method = 'cash' | 'card';

export function changeFor(tendered: number, amount: number): number {
  return Math.max(0, tendered - amount);
}

/** Tendered amounts worth a quick button: notes that cover the amount (exact has its own button). */
export function quickTenders(amount: number): number[] {
  if (amount <= 0) return [];
  const covering = IQD_NOTES.filter((n) => n >= amount);
  return covering.length > 0 ? [...covering] : [Math.ceil(amount / BIGGEST_NOTE) * BIGGEST_NOTE];
}

/** Digits only (Western or Arabic-Indic), thousands separators ignored. */
export function parseAmount(text: string): number | null {
  const s = asciiDigits(text).replace(/[,\s٬]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** "12.5" percent to 1250 basis points. 0 < pct <= 100, at most two decimals. */
export function percentToBps(text: string): number | null {
  const s = asciiDigits(text).trim();
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps > 0 && bps <= 10000 ? bps : null;
}

export type DiscountMode = 'percent' | 'amount';

export function discountArgs(
  mode: DiscountMode,
  text: string,
): { p_kind: 'discount_percent' | 'discount_amount'; p_value: number } | null {
  if (mode === 'percent') {
    const bps = percentToBps(text);
    return bps === null ? null : { p_kind: 'discount_percent', p_value: bps };
  }
  const n = parseAmount(text);
  return n === null || n <= 0 ? null : { p_kind: 'discount_amount', p_value: n };
}

export type PayBlock = 'submitting' | 'noShift' | 'amount' | 'tendered';

export function canPay(i: {
  method: Method;
  amount: number;
  due: number;
  tendered: number;
  shiftOpen: boolean;
  submitting: boolean;
}): { ok: true } | { ok: false; why: PayBlock } {
  if (i.submitting) return { ok: false, why: 'submitting' };
  if (i.method === 'cash' && !i.shiftOpen) return { ok: false, why: 'noShift' };
  if (i.amount <= 0 || i.amount > i.due) return { ok: false, why: 'amount' };
  if (i.method === 'cash' && i.tendered < i.amount) return { ok: false, why: 'tendered' };
  return { ok: true };
}

export interface Attempt {
  sig: string;
  key: string;
}

/** The same payment (same signature) keeps its idempotency key across retries. */
export function attemptKey(prev: Attempt | null, sig: string, make: () => string): Attempt {
  return prev && prev.sig === sig ? prev : { sig, key: make() };
}

export function refundable(paid: number, refunded: number): number {
  return Math.max(0, paid - refunded);
}

/** The instant the current business day started (venue-local midnight). */
export function startOfBusinessDay(now: Date): Date {
  return wallTimeToUtc(localParts(now, VENUE_TZ).date, 0, VENUE_TZ);
}

// ---- server shapes ----

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  refunded: number;
  due: number;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {});
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export function parseTotals(raw: unknown): Totals {
  const o = rec(raw);
  return {
    subtotal: num(o.subtotal),
    discount: num(o.discount),
    tax: num(o.tax),
    total: num(o.total),
    paid: num(o.paid),
    refunded: num(o.refunded),
    due: num(o.due),
  };
}

export interface SettleResult {
  paymentId: string;
  tabId: string;
  method: Method;
  amount: number;
  tendered: number | null;
  change: number;
  settled: boolean;
  totals: Totals;
}

export function parseSettleResult(raw: unknown): SettleResult {
  const o = rec(raw);
  return {
    paymentId: String(o.payment_id ?? ''),
    tabId: String(o.tab_id ?? ''),
    method: o.method === 'card' ? 'card' : 'cash',
    amount: num(o.amount),
    tendered: o.tendered == null ? null : num(o.tendered),
    change: num(o.change),
    settled: o.status === 'settled',
    totals: parseTotals(o.totals),
  };
}

export interface ShiftClose {
  shiftId: string;
  openingFloat: number;
  counted: number;
  expected: number;
  variance: number;
}

export function parseShiftClose(raw: unknown): ShiftClose {
  const o = rec(raw);
  return {
    shiftId: String(o.shift_id ?? ''),
    openingFloat: num(o.opening_float),
    counted: num(o.counted_cash),
    expected: num(o.expected_cash),
    variance: num(o.variance),
  };
}

export function parseShares(raw: unknown): number[] {
  const shares = rec(raw).shares;
  return Array.isArray(shares) ? shares.map(num) : [];
}

export function parseItemSplit(raw: unknown): { amount: number; due: number } {
  const o = rec(raw);
  return { amount: num(o.amount), due: num(o.due) };
}

export type ShiftStatus =
  | { open: false }
  | { open: true; shiftId: string; staffId: string; staffName: string; openedAt: string; openingFloat: number };

export function parseShiftStatus(raw: unknown): ShiftStatus {
  const o = rec(raw);
  if (o.open !== true) return { open: false };
  return {
    open: true,
    shiftId: String(o.shift_id ?? ''),
    staffId: String(o.staff_id ?? ''),
    staffName: String(o.staff_name ?? ''),
    openedAt: String(o.opened_at ?? ''),
    openingFloat: num(o.opening_float),
  };
}

/** Keep rows whose table label contains the search text (case and digit-script blind). */
export function filterByLabel<T extends { tableLabel: string | null }>(rows: readonly T[], search: string): T[] {
  const q = asciiDigits(search).trim().toLowerCase();
  if (q === '') return [...rows];
  return rows.filter((r) => asciiDigits(r.tableLabel ?? '').toLowerCase().includes(q));
}

/** Payment key signature: tab, method and amount only. Tendered cash never changes the key. */
export const paymentSig = (tabId: string, method: Method, amount: number, generation: number): string =>
  [tabId, method, amount, generation].join('|');

/** After an unclear payment: did the bill's due amount move? Then the payment landed. */
export const paymentLanded = (dueBefore: number, dueNow: number): boolean => dueNow < dueBefore;
