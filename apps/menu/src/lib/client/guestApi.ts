/**
 * The browser's only door to the server: this site's own /api routes, each call carrying the
 * x-rop-guest header. The browser never talks to Supabase and never sees the session id.
 */
import { GUEST_HEADER, GUEST_HEADER_VALUE } from '../securityLogic';
import { GUEST_RESULTS, type GuestResult } from '../guestErrorLogic';
import type { CallReason, OrderLineRequest } from '../requestLogic';

export type GuestAnswer<T> = { ok: true; data: T } | { ok: false; result: GuestResult; code: string | null };

/** Read an /api answer defensively; a dropped connection or an odd body is an `error`. */
export function readAnswer<T>(status: number, body: unknown): GuestAnswer<T> {
  if (body && typeof body === 'object') {
    const b = body as { ok?: unknown; data?: unknown; result?: unknown; code?: unknown };
    if (b.ok === true && status < 400) return { ok: true, data: b.data as T };
    if (b.ok === false && GUEST_RESULTS.includes(b.result as GuestResult)) {
      return { ok: false, result: b.result as GuestResult, code: typeof b.code === 'string' ? b.code : null };
    }
  }
  return { ok: false, result: 'error', code: null };
}

async function send<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<GuestAnswer<T>> {
  try {
    const res = await fetch(path, {
      method: init.method,
      headers: { [GUEST_HEADER]: GUEST_HEADER_VALUE, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    return readAnswer<T>(res.status, await res.json().catch(() => null));
  } catch {
    return { ok: false, result: 'error', code: null };
  }
}

export const guestApi = {
  /** `key` from guestKey('raise_waiter_call'), reused for this tap's retries. */
  call: (reason: CallReason, key: string) => send<unknown>('/api/call', { method: 'POST', body: { reason, key } }),
  /** `key` from guestKey('send_guest_order'), reused until the server answers. */
  order: (items: OrderLineRequest[], key: string) => send<unknown>('/api/order', { method: 'POST', body: { items, key } }),
  status: () => send<unknown>('/api/status', { method: 'GET' }),
  setLocale: (locale: 'en' | 'ar') => send<{ locale: string }>('/api/locale', { method: 'POST', body: { locale } }),
};
