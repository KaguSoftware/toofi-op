/**
 * The bodies the guest site's API accepts, checked for shape before anything reaches the
 * database. Values (ids, quantities, notes) are the database's to judge: it answers with a
 * code the guest can read. Anything not named here, a price above all, is dropped.
 */
import { IDEM_KEY_RE } from '@rop/core';

export const CALL_REASONS = ['order', 'bill', 'water', 'help'] as const;
export type CallReason = (typeof CALL_REASONS)[number];

/** What one order line carries: ids, a quantity and a note. Never a price. */
export interface OrderLineRequest {
  menu_item_id: string;
  qty: number;
  modifier_ids: string[];
  note: string | null;
}

/** Far above the database's own limits (40 lines, 140-character notes), so its codes still speak. */
const MAX_LINES = 100;
const MAX_MODIFIERS = 50;
const MAX_NOTE = 1000;
/** A request body larger than this is refused unread. */
export const MAX_BODY_BYTES = 64 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isIdemKey(value: unknown): value is string {
  return typeof value === 'string' && IDEM_KEY_RE.test(value);
}

export function parseCallBody(body: unknown): { reason: CallReason; key: string } | null {
  if (!isRecord(body) || !isIdemKey(body.key)) return null;
  const reason = CALL_REASONS.find((r) => r === body.reason);
  return reason ? { reason, key: body.key } : null;
}

function parseLine(raw: unknown): OrderLineRequest | null {
  if (!isRecord(raw)) return null;
  const { menu_item_id, qty, modifier_ids = [], note = null } = raw;
  if (typeof menu_item_id !== 'string' || menu_item_id.length > 64) return null;
  if (typeof qty !== 'number' || !Number.isFinite(qty)) return null;
  if (!Array.isArray(modifier_ids) || modifier_ids.length > MAX_MODIFIERS) return null;
  if (!modifier_ids.every((m): m is string => typeof m === 'string' && m.length <= 64)) return null;
  if (note !== null && (typeof note !== 'string' || note.length > MAX_NOTE)) return null;
  return { menu_item_id, qty, modifier_ids, note };
}

export function parseOrderBody(body: unknown): { items: OrderLineRequest[]; key: string } | null {
  if (!isRecord(body) || !isIdemKey(body.key)) return null;
  if (!Array.isArray(body.items) || body.items.length > MAX_LINES) return null;
  const items: OrderLineRequest[] = [];
  for (const raw of body.items) {
    const line = parseLine(raw);
    if (!line) return null;
    items.push(line);
  }
  return { items, key: body.key };
}

export function parseLocaleBody(body: unknown): { locale: 'en' | 'ar' } | null {
  if (!isRecord(body)) return null;
  return body.locale === 'en' || body.locale === 'ar' ? { locale: body.locale } : null;
}
