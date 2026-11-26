/**
 * The guest site's route handlers, with the database replaced by a stub of guestRpc.
 * Covers: bad token shape, invalid token, expired session, missing header, each error
 * mapping, and that no response body (or redirect) carries the token or the session id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { idemKey } from '@rop/core';

const rpc = vi.hoisted(() => ({ guestRpc: vi.fn() }));
vi.mock('@/lib/server/guestRpc', () => rpc);

import { GET as openTable } from './t/[token]/route';
import { GET as scanAgain } from './scan-again/route';
import { POST as call } from './api/call/route';
import { POST as order } from './api/order/route';
import { GET as status } from './api/status/route';
import { POST as setLocale } from './api/locale/route';

const TOKEN = 'AbCdEfGhIjKlMnOpQrSt_-';
const SID = '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const BASE = 'http://localhost:5180';
const KEY = idemKey('G-ABCDEFGHJK', 'raise_waiter_call');

function req(path: string, opts: { method?: string; body?: unknown; header?: boolean; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.header !== false) headers.set('x-rop-guest', '1');
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const withSession = { cookie: `rop-table=${SID}` };
const tokenParams = (token: string) => ({ params: Promise.resolve({ token }) });

/** Everything a guest could read off a response: body, Location, and cookies other than ours. */
async function visible(res: Response): Promise<string> {
  const body = await res.clone().text();
  const location = res.headers.get('location') ?? '';
  return `${body}\n${location}`;
}

beforeEach(() => {
  rpc.guestRpc.mockReset();
});

describe('GET /t/[token]', () => {
  it('refuses a token that is not 22 base64url characters without asking the database', async () => {
    for (const bad of ['short', `${TOKEN}x`, 'AbCdEfGhIjKlMnOpQrSt+/', 'AbCdEfGhIjKlMnOpQrSt.-']) {
      const res = await openTable(req(`/t/${encodeURIComponent(bad)}`, { header: false }), tokenParams(bad));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).search).toBe('?notice=scan-again');
      expect(res.cookies.get('rop-table')).toBeUndefined();
    }
    expect(rpc.guestRpc).not.toHaveBeenCalled();
  });

  it('opens a session, sets the cookie and lands on / with no token in the address', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: true, data: { session_id: SID, table_label: 'T5', expires_at: 'x', calls_enabled: true, orders_enabled: true, day_open: true } });
    const res = await openTable(req(`/t/${TOKEN}`, { header: false }), tokenParams(TOKEN));
    expect(rpc.guestRpc).toHaveBeenCalledWith('open_table_session', { p_token: TOKEN });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${BASE}/`);
    const cookie = res.cookies.get('rop-table');
    expect(cookie).toMatchObject({ value: SID, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7200 });
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const seen = await visible(res);
    expect(seen).not.toContain(TOKEN);
    expect(seen).not.toContain(SID);
  });

  it('sends an invalid token to / with the scan-again notice and no cookie', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code: 'TABLE_LINK_INVALID' });
    const res = await openTable(req(`/t/${TOKEN}?x=1`, { header: false }), tokenParams(TOKEN));
    expect(res.headers.get('location')).toBe(`${BASE}/?notice=scan-again`);
    expect(res.cookies.get('rop-table')).toBeUndefined();
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await visible(res)).not.toContain(TOKEN);
  });

  it('treats no answer from the database like an invalid token', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code: null });
    const res = await openTable(req(`/t/${TOKEN}`, { header: false }), tokenParams(TOKEN));
    expect(res.headers.get('location')).toBe(`${BASE}/?notice=scan-again`);
    expect(res.cookies.get('rop-table')).toBeUndefined();
  });
});

describe('GET /scan-again', () => {
  it('clears the cookie once the database says the session ended', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code: 'SESSION_EXPIRED' });
    const res = await scanAgain(req('/scan-again', { header: false, ...withSession }));
    expect(res.headers.get('location')).toBe(`${BASE}/?notice=scan-again`);
    expect(res.cookies.get('rop-table')?.value).toBe('');
    expect(await visible(res)).not.toContain(SID);
  });

  it('keeps a live session (a link from elsewhere cannot unbind the table)', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: true, data: { table_label: 'T5' } });
    const res = await scanAgain(req('/scan-again', { header: false, ...withSession }));
    expect(res.headers.get('location')).toBe(`${BASE}/`);
    expect(res.cookies.get('rop-table')).toBeUndefined();
  });
});

describe('the /api guard', () => {
  it('refuses every call without the x-rop-guest header, before reading the session', async () => {
    const calls = [
      call(req('/api/call', { method: 'POST', body: { reason: 'bill', key: KEY }, header: false, ...withSession })),
      order(req('/api/order', { method: 'POST', body: { items: [], key: KEY }, header: false, ...withSession })),
      status(req('/api/status', { header: false, ...withSession })),
      setLocale(req('/api/locale', { method: 'POST', body: { locale: 'en' }, header: false })),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, result: 'error', code: 'FORBIDDEN' });
      expect(res.headers.get('cache-control')).toContain('no-store');
    }
    expect(rpc.guestRpc).not.toHaveBeenCalled();
  });

  it('answers expired, and clears the cookie, when there is no session', async () => {
    const res = await call(req('/api/call', { method: 'POST', body: { reason: 'bill', key: KEY }, cookie: 'rop-table=not-a-uuid' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, result: 'expired', code: 'SESSION_EXPIRED' });
    expect(res.cookies.get('rop-table')?.value).toBe('');
    expect(rpc.guestRpc).not.toHaveBeenCalled();
  });

  it('refuses a malformed body', async () => {
    const res = await call(req('/api/call', { method: 'POST', body: { reason: 'dance', key: KEY }, ...withSession }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, result: 'error', code: 'INVALID_ARGUMENT' });
  });
});

describe('POST /api/call', () => {
  it('raises the call with the session from the cookie and answers without the session id', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: true, data: { call_id: 'c1', status: 'waiting', reason: 'bill', called_at: 't', already: false, session_id: SID } });
    const res = await call(req('/api/call', { method: 'POST', body: { reason: 'bill', key: KEY }, ...withSession }));
    expect(rpc.guestRpc).toHaveBeenCalledWith('raise_waiter_call', { p_session_id: SID, p_reason: 'bill', p_idempotency_key: KEY });
    expect(res.status).toBe(200);
    expect(await visible(res)).not.toContain(SID);
    expect(await res.json()).toEqual({ ok: true, data: { call_id: 'c1', status: 'waiting', reason: 'bill', called_at: 't', already: false } });
  });

  it.each([
    ['SESSION_EXPIRED', 'expired', 401],
    ['DAY_NOT_OPEN', 'closed', 409],
    ['GUEST_CALLS_OFF', 'off', 409],
    ['CALL_TOO_SOON', 'too-soon', 409],
    ['TOO_MANY_REQUESTS', 'limit', 429],
    ['INVALID_ARGUMENT', 'error', 400],
    [null, 'error', 502],
  ] as const)('maps %s to %s', async (code, result, httpStatus) => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code });
    const res = await call(req('/api/call', { method: 'POST', body: { reason: 'water', key: KEY }, ...withSession }));
    expect(res.status).toBe(httpStatus);
    expect(await res.json()).toEqual({ ok: false, result, code });
    expect(res.cookies.get('rop-table')?.value).toBe(result === 'expired' ? '' : undefined);
  });
});

describe('POST /api/order', () => {
  const line = { menu_item_id: 'i1', qty: 2, modifier_ids: ['m1'], note: 'no onions' };

  it('sends ids, quantities, modifiers and the note, never a price', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: true, data: { guest_order_id: 'g1', status: 'pending', lines: [], total: 30000, sent_at: 't' } });
    const res = await order(req('/api/order', { method: 'POST', body: { items: [{ ...line, price: 1 }], key: KEY, total: 1 }, ...withSession }));
    expect(rpc.guestRpc).toHaveBeenCalledWith('send_guest_order', { p_session_id: SID, p_items: [line], p_idempotency_key: KEY });
    expect(await res.json()).toMatchObject({ ok: true, data: { guest_order_id: 'g1', total: 30000 } });
  });

  it.each([
    ['SESSION_EXPIRED', 'expired'],
    ['DAY_NOT_OPEN', 'closed'],
    ['GUEST_ORDERS_OFF', 'off'],
    ['TOO_MANY_PENDING_ORDERS', 'limit'],
    ['TOO_MANY_ITEMS', 'limit'],
    ['INVALID_QTY', 'limit'],
    ['ITEMS_REQUIRED', 'limit'],
    ['ITEM_NOT_AVAILABLE', 'stale-menu'],
    ['MODIFIER_NOT_ALLOWED', 'stale-menu'],
    ['MODIFIER_SELECTION_INVALID', 'stale-menu'],
    ['INVALID_PRICE', 'stale-menu'],
    ['IDEMPOTENCY_KEY_REQUIRED', 'error'],
  ] as const)('maps %s to %s', async (code, result) => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code });
    const res = await order(req('/api/order', { method: 'POST', body: { items: [line], key: KEY }, ...withSession }));
    expect(await res.json()).toEqual({ ok: false, result, code });
  });
});

describe('GET /api/status', () => {
  it('passes the status on without any session id', async () => {
    rpc.guestRpc.mockResolvedValue({
      ok: true,
      data: { table_label: 'T5', day_open: true, calls_enabled: true, orders_enabled: true, call: null, call_again_at: null, orders: [{ id: 'o1', status: 'pending', guest_session_id: SID }] },
    });
    const res = await status(req('/api/status', withSession));
    expect(rpc.guestRpc).toHaveBeenCalledWith('guest_status', { p_session_id: SID });
    expect(await visible(res)).not.toContain(SID);
    const body = await res.json();
    expect(body.data.orders).toEqual([{ id: 'o1', status: 'pending' }]);
    expect(Date.parse(body.data.server_now)).not.toBeNaN();
  });

  it('answers expired and clears the cookie for an ended session', async () => {
    rpc.guestRpc.mockResolvedValue({ ok: false, code: 'SESSION_EXPIRED' });
    const res = await status(req('/api/status', withSession));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, result: 'expired', code: 'SESSION_EXPIRED' });
    expect(res.cookies.get('rop-table')?.value).toBe('');
  });
});

describe('POST /api/locale', () => {
  it('sets the rop-locale cookie', async () => {
    const res = await setLocale(req('/api/locale', { method: 'POST', body: { locale: 'en' } }));
    expect(res.status).toBe(200);
    expect(res.cookies.get('rop-locale')).toMatchObject({ value: 'en', httpOnly: true, path: '/' });
  });

  it('refuses another language', async () => {
    const res = await setLocale(req('/api/locale', { method: 'POST', body: { locale: 'fr' } }));
    expect(res.status).toBe(400);
    expect(res.cookies.get('rop-locale')).toBeUndefined();
  });
});
