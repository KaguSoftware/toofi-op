/**
 * Sending an order and following it, as pure functions: what the phone keeps between visits,
 * the one idempotency key an unanswered send holds on to, what the answer to `POST /api/order`
 * means, and which strips this phone's orders (from `guest_status`) call for.
 * Times are epoch milliseconds on the SERVER's clock (see useServerClock).
 */
import type { GuestAnswer } from './client/guestApi';
import { MAX_QTY, addToBasket, clipNote, type BasketLine } from './basketLogic';
import type { SessionState } from './callLogic';
import { isIdemKey, type OrderLineRequest } from './requestLogic';

/** After this long pending, the strip adds "ask a waiter". */
export const ORDER_LATE_MS = 180_000;
/** A decided order's strip is shown for this long after the order was sent, unless dismissed. */
export const DECIDED_WINDOW_MS = 30 * 60_000;
/** The basket is forgotten after this long on the phone. */
export const BASKET_TTL_MS = 12 * 60 * 60_000;
export const BASKET_STORAGE_KEY = 'rop.guest-basket';

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const ms = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Date.parse(v) : Number.NaN;
  return Number.isNaN(n) ? null : n;
};

// --- this phone's orders, from guest_status ------------------------------------------------

export const ORDER_STATUSES = ['pending', 'accepted', 'declined', 'expired'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface GuestOrder {
  id: string;
  status: OrderStatus;
  sentAt: number;
  total: number;
}

function parseOrder(raw: unknown): GuestOrder | null {
  if (!isRow(raw) || typeof raw.id !== 'string') return null;
  const status = ORDER_STATUSES.find((s) => s === raw.status);
  const sentAt = ms(raw.sent_at);
  if (!status || sentAt === null) return null;
  return { id: raw.id, status, sentAt, total: typeof raw.total === 'number' && Number.isInteger(raw.total) ? raw.total : 0 };
}

/** The `orders` of `app.guest_status` (newest first), without anything unreadable. */
export function parseOrders(raw: unknown): GuestOrder[] {
  return Array.isArray(raw) ? raw.flatMap((o) => parseOrder(o) ?? []) : [];
}

export const hasPendingOrder = (orders: readonly GuestOrder[]): boolean => orders.some((o) => o.status === 'pending');

export interface OrderStrips {
  /** Something is waiting for staff; `late` adds "ask a waiter". */
  waiting: 'waiting' | 'late' | null;
  /** The newest answered order that has not been dismissed. */
  decided: { id: string; kind: 'accepted' | 'declined' | 'expired' } | null;
}

export function orderStrips(orders: readonly GuestOrder[], now: number, dismissed: ReadonlySet<string>): OrderStrips {
  const pending = orders.filter((o) => o.status === 'pending');
  const oldest = pending.reduce<number | null>((min, o) => (min === null || o.sentAt < min ? o.sentAt : min), null);
  const waiting = oldest === null ? null : now - oldest >= ORDER_LATE_MS ? 'late' : 'waiting';

  let decided: OrderStrips['decided'] = null;
  let newest = -Infinity;
  for (const o of orders) {
    if (o.status === 'pending' || dismissed.has(o.id) || now - o.sentAt >= DECIDED_WINDOW_MS || o.sentAt <= newest) continue;
    newest = o.sentAt;
    decided = { id: o.id, kind: o.status };
  }
  return { waiting, decided };
}

// --- the answer to a send ------------------------------------------------------------------

export type SendOutcome =
  | { kind: 'sent'; order: GuestOrder }
  /** The outcome is not known: the order may or may not exist. Keep the key and say so. */
  | { kind: 'unclear' }
  | { kind: 'expired' }
  | { kind: 'closed' }
  | { kind: 'off' }
  /** A dish or option changed since the menu loaded: refresh it and mark the line. */
  | { kind: 'stale-menu'; code: string }
  /** The server refused with a code the guest can read (a limit, or anything else): stay in the sheet. */
  | { kind: 'message'; code: string | null };

export function sendOutcome(answer: GuestAnswer<unknown>): SendOutcome {
  if (answer.ok) {
    const d = answer.data;
    const order = isRow(d) ? parseOrder({ id: d.guest_order_id, status: d.status, sent_at: d.sent_at, total: d.total }) : null;
    // A success we cannot read may still have created the order: never treat it as a refusal.
    return order ? { kind: 'sent', order } : { kind: 'unclear' };
  }
  switch (answer.result) {
    case 'expired':
    case 'closed':
    case 'off':
      return { kind: answer.result };
    case 'stale-menu':
      return { kind: 'stale-menu', code: answer.code ?? '' };
    case 'error':
      // No code: the connection dropped or the database never answered.
      return answer.code === null ? { kind: 'unclear' } : { kind: 'message', code: answer.code };
    default:
      return { kind: 'message', code: answer.code };
  }
}

// --- may the phone send at all? -------------------------------------------------------------

export type SendGate = 'ok' | 'scan' | 'expired' | 'closed' | 'off';

/**
 * What the sheet does before it asks the server: no table or an ended session means a scan, a closed
 * day or switched-off ordering is explained. The order is kept in every case.
 */
export function sendGate(session: SessionState, status: { dayOpen: boolean; ordersEnabled: boolean } | null): SendGate {
  if (session === 'none') return 'scan';
  if (session === 'expired') return 'expired';
  if (!status) return 'ok';
  if (!status.ordersEnabled) return 'off';
  if (!status.dayOpen) return 'closed';
  return 'ok';
}

// --- one key per attempt -------------------------------------------------------------------

export interface SendAttempt {
  key: string;
  /** What was sent under that key. The server replays by key alone, so a changed order needs a new one. */
  signature: string;
}

export const requestSignature = (request: readonly OrderLineRequest[]): string => JSON.stringify(request);

/** The attempt for this request: the unanswered one if the order is unchanged, else a new key. */
export function attemptFor(previous: SendAttempt | null, request: readonly OrderLineRequest[], makeKey: () => string): SendAttempt {
  const signature = requestSignature(request);
  return previous && previous.signature === signature ? previous : { key: makeKey(), signature };
}

// --- what the phone keeps ------------------------------------------------------------------

export interface StoredBasket {
  lines: BasketLine[];
  note: string;
  /** Set from the moment a send starts until the server answers: it is what makes a retry safe. */
  attempt: SendAttempt | null;
}

const STORED_VERSION = 1;
export const emptyBasket = (): StoredBasket => ({ lines: [], note: '', attempt: null });

function parseLine(raw: unknown): BasketLine | null {
  if (!isRow(raw) || typeof raw.itemId !== 'string' || raw.itemId.length > 64) return null;
  if (typeof raw.qty !== 'number' || !Number.isInteger(raw.qty) || raw.qty < 1 || raw.qty > MAX_QTY) return null;
  if (!Array.isArray(raw.modifierIds) || raw.modifierIds.length > 50) return null;
  if (!raw.modifierIds.every((m): m is string => typeof m === 'string' && m.length <= 64)) return null;
  const name = typeof raw.name === 'string' && raw.name.length <= 200 ? raw.name : '';
  return { itemId: raw.itemId, qty: raw.qty, modifierIds: [...raw.modifierIds].sort(), ...(name ? { name } : {}) };
}

/** The saved basket, read defensively; anything missing, odd, from another format or too old is an empty basket. */
export function parseStored(raw: string | null, now: number): StoredBasket {
  if (!raw) return emptyBasket();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyBasket();
  }
  if (!isRow(data) || data.v !== STORED_VERSION || typeof data.savedAt !== 'number' || now - data.savedAt >= BASKET_TTL_MS) return emptyBasket();
  // Through addToBasket, so equal lines merge and the line and quantity caps hold whatever the stored text says.
  const lines = (Array.isArray(data.lines) ? data.lines : []).reduce<BasketLine[]>((all, raw) => {
    const l = parseLine(raw);
    return l ? addToBasket(all, l.itemId, l.modifierIds, l.qty, l.name).lines : all;
  }, []);
  const attempt = isRow(data.attempt) && isIdemKey(data.attempt.key) && typeof data.attempt.signature === 'string' ? { key: data.attempt.key, signature: data.attempt.signature } : null;
  return { lines, note: typeof data.note === 'string' ? clipNote(data.note) : '', attempt };
}

export function serializeStored(basket: StoredBasket, now: number): string {
  return JSON.stringify({ v: STORED_VERSION, savedAt: now, ...basket });
}
