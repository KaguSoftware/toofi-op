/**
 * Call waiter, as the guest's phone reasons about it. Pure: the status the server last
 * sent, the clock, and what the call button and the strip above the bottom bar should be.
 * All times are epoch milliseconds on the SERVER's clock (see useServerClock); a phone's own
 * clock can be minutes off, and a countdown built on it would be wrong by the same amount.
 */
import type { GuestAnswer } from './client/guestApi';
import { parseOrders, type GuestOrder } from './orderLogic';
import { CALL_REASONS, type CallReason } from './requestLogic';

/** The phone asks again this often while a call is waiting, and not otherwise. */
export const POLL_MS = 5000;
/** "A waiter is on the way" stays up this long after the answer, then goes quiet. */
export const ANSWERED_STRIP_MS = 120_000;

export interface GuestCall {
  id: string;
  reason: CallReason;
  status: 'waiting' | 'answered';
  calledAt: number;
  answeredAt: number | null;
}

/** `app.guest_status` as the screen reads it. */
export interface GuestStatus {
  tableLabel: string;
  dayOpen: boolean;
  callsEnabled: boolean;
  ordersEnabled: boolean;
  call: GuestCall | null;
  /** When the wait before calling again ends; null when there is none. */
  callAgainAt: number | null;
  /** This phone's orders, newest first. */
  orders: GuestOrder[];
}

/** `none`: browsing with no table. `expired`: there was a table, the session ended. */
export type SessionState = 'none' | 'live' | 'expired';

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const ms = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Date.parse(v) : Number.NaN;
  return Number.isNaN(n) ? null : n;
};

function parseCall(raw: unknown): GuestCall | null {
  if (!isRow(raw) || typeof raw.id !== 'string') return null;
  const reason = CALL_REASONS.find((r) => r === raw.reason);
  if (!reason || (raw.status !== 'waiting' && raw.status !== 'answered')) return null;
  return { id: raw.id, reason, status: raw.status, calledAt: ms(raw.called_at) ?? 0, answeredAt: ms(raw.answered_at) };
}

export function parseGuestStatus(data: unknown): GuestStatus | null {
  if (!isRow(data) || typeof data.table_label !== 'string') return null;
  return {
    tableLabel: data.table_label,
    dayOpen: data.day_open === true,
    callsEnabled: data.calls_enabled === true,
    ordersEnabled: data.orders_enabled === true,
    call: parseCall(data.call),
    callAgainAt: ms(data.call_again_at),
    orders: parseOrders(data.orders),
  };
}

/** The server's clock reading from a status answer (`server_now`), when it carries one. */
export function serverNowOf(data: unknown): number | null {
  return isRow(data) ? ms(data.server_now) : null;
}

export type CallButton =
  | { kind: 'ready' }
  | { kind: 'wait'; msLeft: number }
  | { kind: 'scan'; why: 'no-table' | 'expired' }
  | { kind: 'closed' }
  | { kind: 'off' };

/** What the Call waiter button is and does. `off` means it is left out. */
export function callButton(input: { session: SessionState; status: GuestStatus | null; now: number }): CallButton {
  const { session, status, now } = input;
  if (session === 'none') return { kind: 'scan', why: 'no-table' };
  if (session === 'expired') return { kind: 'scan', why: 'expired' };
  if (!status) return { kind: 'ready' };
  if (!status.callsEnabled) return { kind: 'off' };
  if (!status.dayOpen) return { kind: 'closed' };
  if (status.callAgainAt !== null && status.callAgainAt > now) return { kind: 'wait', msLeft: status.callAgainAt - now };
  return { kind: 'ready' };
}

export type CallStrip = 'waiting' | 'answered' | null;

export function callStrip(call: GuestCall | null, now: number): CallStrip {
  if (!call) return null;
  if (call.status === 'waiting') return 'waiting';
  return call.answeredAt !== null && now < call.answeredAt + ANSWERED_STRIP_MS ? 'answered' : null;
}

/** Whether something on screen changes with the clock: a countdown, or a strip that times out. */
export function needsClock(status: GuestStatus | null, now: number): boolean {
  if (!status) return false;
  if (status.callAgainAt !== null && status.callAgainAt > now) return true;
  return callStrip(status.call, now) === 'answered';
}

/** `1:42`: whole seconds, rounded up so the last second still reads 0:01. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export type CallOutcome =
  | { kind: 'raised'; call: GuestCall }
  | { kind: 'expired' }
  | { kind: 'closed' }
  | { kind: 'off' }
  | { kind: 'too-soon' }
  /** Stay in the sheet and say why; `code` picks the wording (copyLogic errorText). */
  | { kind: 'message'; code: string | null };

/** What the screen does with the answer to `POST /api/call`. */
export function callOutcome(answer: GuestAnswer<unknown>): CallOutcome {
  if (answer.ok) {
    const call = parseCall({ ...(isRow(answer.data) ? answer.data : {}), id: isRow(answer.data) ? answer.data.call_id : undefined });
    return call ? { kind: 'raised', call } : { kind: 'message', code: null };
  }
  switch (answer.result) {
    case 'expired':
    case 'closed':
    case 'off':
    case 'too-soon':
      return { kind: answer.result };
    default:
      return { kind: 'message', code: answer.code };
  }
}
