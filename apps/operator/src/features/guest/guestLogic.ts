// Pure logic for the guest inbox: what app.guest_inbox() returns, the order rows are shown
// in, how urgent a wait is, when to chime, and how to read an accept failure.

export type CallReason = 'order' | 'bill' | 'water' | 'help';

/** One server-priced line of a guest order (spec.md, "As built": quote line). */
export interface QuoteLine {
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  qty: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  modifiers: { id: string; name_en: string; name_ar: string; price_delta: number }[];
}

export interface InboxCall {
  id: string;
  table_id: string;
  table_label: string;
  reason: CallReason;
  called_at: string;
}

export interface InboxOrder {
  id: string;
  table_id: string;
  table_label: string;
  sent_at: string;
  lines: QuoteLine[];
  /** Integer IQD as the guest saw it when sending. */
  total: number;
  /** Integer IQD at today's prices; null when a dish is unavailable. */
  current_total: number | null;
  price_changed: boolean;
  unavailable: boolean;
  table_has_tab: boolean;
}

export interface GuestInbox {
  calls: InboxCall[];
  orders: InboxOrder[];
}

export type InboxEntry =
  | { kind: 'call'; key: string; at: string; mine: boolean; call: InboxCall }
  | { kind: 'order'; key: string; at: string; mine: boolean; order: InboxOrder };

export const AMBER_SECONDS = 120;
export const RED_SECONDS = 300;
/** While something has waited RED_SECONDS or more, the chime repeats this often. */
export const RECHIME_MS = 60_000;

export function waitedSeconds(at: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(at)) / 1000));
}

export type Urgency = 'normal' | 'amber' | 'red';

export function urgency(seconds: number): Urgency {
  if (seconds >= RED_SECONDS) return 'red';
  if (seconds >= AMBER_SECONDS) return 'amber';
  return 'normal';
}

/** Calls and orders in one list: the signed-in staff member's tables first, then oldest first. */
export function sortInbox(inbox: GuestInbox, mine: ReadonlySet<string>): InboxEntry[] {
  const entries: InboxEntry[] = [
    ...inbox.calls.map((c) => ({
      kind: 'call' as const,
      key: `call:${c.id}`,
      at: c.called_at,
      mine: mine.has(c.table_id),
      call: c,
    })),
    ...inbox.orders.map((o) => ({
      kind: 'order' as const,
      key: `order:${o.id}`,
      at: o.sent_at,
      mine: mine.has(o.table_id),
      order: o,
    })),
  ];
  return entries.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Date.parse(a.at) - Date.parse(b.at) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** Tables whose open tab belongs to this staff member (rows of v_floor_status). */
export function myTableIds(
  rows: readonly { table_id: string; waiter_id: string | null }[],
  staffId: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!staffId) return out;
  for (const r of rows) if (r.waiter_id === staffId) out.add(r.table_id);
  return out;
}

/** table_id -> called_at, for the "Calling" badge on the floor. */
export function callsByTable(calls: readonly InboxCall[]): Map<string, string> {
  return new Map(calls.map((c) => [c.table_id, c.called_at]));
}

export interface ChimeState {
  seen: ReadonlySet<string>;
  lastChimeMs: number | null;
}

export const initialChimeState: ChimeState = { seen: new Set(), lastChimeMs: null };

/**
 * 'arrive' when an entry this device has not seen comes in; 'overdue' every RECHIME_MS while
 * anything has waited RED_SECONDS or more; otherwise null. Answered entries are forgotten.
 */
export function nextChime(
  prev: ChimeState,
  entries: readonly { key: string; at: string }[],
  nowMs: number,
): { chime: 'arrive' | 'overdue' | null; next: ChimeState } {
  const seen = new Set(entries.map((e) => e.key));
  const arrived = entries.some((e) => !prev.seen.has(e.key));
  const overdue =
    entries.some((e) => waitedSeconds(e.at, nowMs) >= RED_SECONDS) &&
    (prev.lastChimeMs === null || nowMs - prev.lastChimeMs >= RECHIME_MS);
  const chime = arrived ? 'arrive' : overdue ? 'overdue' : null;
  return { chime, next: { seen, lastChimeMs: chime ? nowMs : prev.lastChimeMs } };
}

const MENU_CHANGED = new Set(['ITEM_NOT_AVAILABLE', 'MODIFIER_NOT_ALLOWED', 'MODIFIER_SELECTION_INVALID', 'INVALID_PRICE']);
const GONE = new Set(['GUEST_ORDER_NOT_PENDING', 'GUEST_ORDER_EXPIRED', 'GUEST_ORDER_NOT_FOUND']);

/**
 * How to handle a failed accept: 'menu' (a dish changed; decline is the way out),
 * 'gone' (someone already decided it, or its day closed), 'retry' (a tab was opened on the
 * table meanwhile; one more try lands on it), 'covers' (the table's tab closed meanwhile, so
 * the guest count is needed after all), or 'other'.
 */
export function acceptFailure(code: string | undefined): 'menu' | 'gone' | 'retry' | 'covers' | 'other' {
  if (!code) return 'other';
  if (code === 'COVERS_REQUIRED') return 'covers';
  if (MENU_CHANGED.has(code)) return 'menu';
  if (GONE.has(code)) return 'gone';
  if (code === 'TABLE_OCCUPIED') return 'retry';
  return 'other';
}
