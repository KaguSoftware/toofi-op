import { describe, expect, it } from 'vitest';
import { IDEM_KEY_RE } from '@rop/core';
import type { GuestAnswer } from './client/guestApi';
import type { BasketLine } from './basketLogic';
import {
  BASKET_TTL_MS,
  DECIDED_WINDOW_MS,
  ORDER_LATE_MS,
  attemptFor,
  hasPendingOrder,
  orderStrips,
  parseOrders,
  parseStored,
  requestSignature,
  sendGate,
  sendOutcome,
  serializeStored,
  type GuestOrder,
} from './orderLogic';

const T0 = Date.parse('2026-11-26T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const order = (patch: Partial<GuestOrder> = {}): GuestOrder => ({ id: 'o1', status: 'pending', sentAt: T0, total: 8000, ...patch });
const KEY = 'G-ABCDEFGHJK:send_guest_order:01JABCDEFGHJKMNPQRSTVWXYZ0';
const OTHER_KEY = 'G-ABCDEFGHJK:send_guest_order:01JABCDEFGHJKMNPQRSTVWXYZ1';

describe('parseOrders', () => {
  it('reads this phone\'s orders from guest_status, and drops anything odd', () => {
    expect(
      parseOrders([
        { id: 'a', status: 'accepted', sent_at: iso(T0), lines: [], total: 8000 },
        { id: 'b', status: 'expired', sent_at: iso(T0 + 1), lines: [], total: 0 },
        { id: 'c', status: 'weird', sent_at: iso(T0), total: 1 },
        { status: 'pending', sent_at: iso(T0), total: 1 },
        'nope',
      ]),
    ).toEqual([
      { id: 'a', status: 'accepted', sentAt: T0, total: 8000 },
      { id: 'b', status: 'expired', sentAt: T0 + 1, total: 0 },
    ]);
  });
  it('is empty for anything that is not a list', () => {
    expect(parseOrders(undefined)).toEqual([]);
    expect(parseOrders({})).toEqual([]);
  });
  it('knows when something is still waiting', () => {
    expect(hasPendingOrder([order({ status: 'accepted' }), order({ id: 'o2' })])).toBe(true);
    expect(hasPendingOrder([order({ status: 'declined' })])).toBe(false);
    expect(hasPendingOrder([])).toBe(false);
  });
});

describe('orderStrips', () => {
  const none = new Set<string>();
  it('says nothing without orders', () => {
    expect(orderStrips([], T0, none)).toEqual({ waiting: null, decided: null });
  });
  it('waiting while an order is pending, and "ask a waiter" after 3 minutes', () => {
    expect(orderStrips([order()], T0 + ORDER_LATE_MS - 1, none).waiting).toBe('waiting');
    expect(orderStrips([order()], T0 + ORDER_LATE_MS, none).waiting).toBe('late');
  });
  it('goes late by the oldest pending order', () => {
    const orders = [order({ id: 'new', sentAt: T0 + 170_000 }), order({ id: 'old', sentAt: T0 })];
    expect(orderStrips(orders, T0 + ORDER_LATE_MS, none).waiting).toBe('late');
  });
  it.each(['accepted', 'declined', 'expired'] as const)('shows a %s order', (status) => {
    expect(orderStrips([order({ status })], T0 + 60_000, none)).toEqual({ waiting: null, decided: { id: 'o1', kind: status } });
  });
  it('shows the newest decided order only, and the waiting strip beside it', () => {
    const orders = [order({ id: 'old', status: 'declined', sentAt: T0 }), order({ id: 'new', status: 'accepted', sentAt: T0 + 1000 }), order({ id: 'p', sentAt: T0 + 2000 })];
    expect(orderStrips(orders, T0 + 5000, none)).toEqual({ waiting: 'waiting', decided: { id: 'new', kind: 'accepted' } });
  });
  it('lets a decided strip be dismissed, then shows the next one', () => {
    const orders = [order({ id: 'old', status: 'declined', sentAt: T0 }), order({ id: 'new', status: 'accepted', sentAt: T0 + 1000 })];
    expect(orderStrips(orders, T0 + 5000, new Set(['new'])).decided).toEqual({ id: 'old', kind: 'declined' });
  });
  it('stops showing a decided order half an hour after it was sent', () => {
    expect(orderStrips([order({ status: 'accepted' })], T0 + DECIDED_WINDOW_MS - 1, none).decided).not.toBeNull();
    expect(orderStrips([order({ status: 'accepted' })], T0 + DECIDED_WINDOW_MS, none).decided).toBeNull();
  });
});

describe('sendOutcome', () => {
  const ok = (data: unknown): GuestAnswer<unknown> => ({ ok: true, data });
  const refused = (result: string, code: string | null): GuestAnswer<unknown> => ({ ok: false, result: result as never, code });

  it('reads the order the server accepted for waiting', () => {
    expect(sendOutcome(ok({ guest_order_id: 'o9', status: 'pending', lines: [], total: 23000, sent_at: iso(T0) }))).toEqual({
      kind: 'sent',
      order: { id: 'o9', status: 'pending', sentAt: T0, total: 23000 },
    });
  });
  it('is unclear when the connection dropped, the server could not answer, or the answer is unreadable', () => {
    expect(sendOutcome(refused('error', null))).toEqual({ kind: 'unclear' });
    expect(sendOutcome(ok({ something: 'else' }))).toEqual({ kind: 'unclear' });
  });
  it.each([
    ['expired', 'SESSION_EXPIRED'],
    ['closed', 'DAY_NOT_OPEN'],
    ['off', 'GUEST_ORDERS_OFF'],
  ])('passes a %s refusal on', (result, code) => {
    expect(sendOutcome(refused(result, code))).toEqual({ kind: result });
  });
  it('asks for a menu refresh when a dish or option changed', () => {
    expect(sendOutcome(refused('stale-menu', 'ITEM_NOT_AVAILABLE'))).toEqual({ kind: 'stale-menu', code: 'ITEM_NOT_AVAILABLE' });
    expect(sendOutcome(refused('stale-menu', 'MODIFIER_SELECTION_INVALID'))).toEqual({ kind: 'stale-menu', code: 'MODIFIER_SELECTION_INVALID' });
  });
  it('keeps the guest in the sheet with a sentence for a limit or any other refusal', () => {
    expect(sendOutcome(refused('limit', 'TOO_MANY_PENDING_ORDERS'))).toEqual({ kind: 'message', code: 'TOO_MANY_PENDING_ORDERS' });
    expect(sendOutcome(refused('error', 'FORBIDDEN'))).toEqual({ kind: 'message', code: 'FORBIDDEN' });
  });
});

describe('the send attempt (one key until the server answers)', () => {
  const lines = (qty: number) => [{ menu_item_id: 'hummus', qty, modifier_ids: [], note: null }];
  it('signs a request by what it says', () => {
    expect(requestSignature(lines(2))).toBe(requestSignature(lines(2)));
    expect(requestSignature(lines(2))).not.toBe(requestSignature(lines(3)));
    expect(requestSignature([{ ...lines(1)[0]!, note: 'hot' }])).not.toBe(requestSignature(lines(1)));
  });
  it('makes a new key when there was no attempt', () => {
    expect(attemptFor(null, lines(1), () => KEY)).toEqual({ key: KEY, signature: requestSignature(lines(1)) });
  });
  it('reuses the key for the same request, so a retry cannot make a second order', () => {
    const first = attemptFor(null, lines(1), () => KEY);
    expect(attemptFor(first, lines(1), () => OTHER_KEY).key).toBe(KEY);
  });
  it('makes a new key when the order changed since the unanswered send', () => {
    const first = attemptFor(null, lines(1), () => KEY);
    expect(attemptFor(first, lines(2), () => OTHER_KEY).key).toBe(OTHER_KEY);
  });
});

describe('what the phone keeps', () => {
  const lines: BasketLine[] = [{ itemId: 'kebab', qty: 2, modifierIds: ['egg', 'fries'], name: 'Lamb Kebab' }];
  const stored = { lines, note: 'no onions', attempt: { key: KEY, signature: 'sig' } };

  it('round-trips the basket, the note and the unanswered attempt', () => {
    expect(parseStored(serializeStored(stored, T0), T0 + 1000)).toEqual(stored);
  });
  it('is empty for nothing, for junk, and for another format', () => {
    const empty = { lines: [], note: '', attempt: null };
    expect(parseStored(null, T0)).toEqual(empty);
    expect(parseStored('not json', T0)).toEqual(empty);
    expect(parseStored('{"v":9,"lines":[]}', T0)).toEqual(empty);
    expect(parseStored('[]', T0)).toEqual(empty);
  });
  it('forgets a basket left on the phone for half a day', () => {
    const raw = serializeStored(stored, T0);
    expect(parseStored(raw, T0 + BASKET_TTL_MS - 1).lines).toHaveLength(1);
    expect(parseStored(raw, T0 + BASKET_TTL_MS)).toEqual({ lines: [], note: '', attempt: null });
  });
  it('drops lines that are not valid, and clips what is too big', () => {
    const raw = JSON.stringify({
      v: 1,
      savedAt: T0,
      note: 'x'.repeat(500),
      attempt: { key: 'not a key', signature: 's' },
      lines: [
        { itemId: 'ok', qty: 3, modifierIds: [] },
        { itemId: 'zero', qty: 0, modifierIds: [] },
        { itemId: 'huge', qty: 99, modifierIds: [] },
        { itemId: 'frac', qty: 1.5, modifierIds: [] },
        { itemId: 7, qty: 1, modifierIds: [] },
        { itemId: 'bad-mods', qty: 1, modifierIds: [1] },
        { itemId: 'ok', qty: 1, modifierIds: [] },
      ],
    });
    const parsed = parseStored(raw, T0);
    // The two valid lines of the same dish merge.
    expect(parsed.lines).toEqual([{ itemId: 'ok', qty: 4, modifierIds: [] }]);
    expect(parsed.note).toHaveLength(140);
    expect(parsed.attempt).toBeNull();
  });
  it('keeps at most 40 lines', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ itemId: `d${i}`, qty: 1, modifierIds: [] }));
    expect(parseStored(JSON.stringify({ v: 1, savedAt: T0, note: '', attempt: null, lines: many }), T0).lines).toHaveLength(40);
  });
  it('never stores a price', () => {
    expect(serializeStored(stored, T0)).not.toMatch(/price|total|delta/i);
    expect(KEY).toMatch(IDEM_KEY_RE);
  });
});

describe('sendGate', () => {
  const open = { dayOpen: true, ordersEnabled: true };
  it('sends on a live table', () => {
    expect(sendGate('live', open)).toBe('ok');
    // A status that failed to load must not stop an order: the server decides.
    expect(sendGate('live', null)).toBe('ok');
  });
  it('asks for a scan with no table or an ended session', () => {
    expect(sendGate('none', null)).toBe('scan');
    expect(sendGate('expired', null)).toBe('expired');
  });
  it('explains a closed day and switched-off ordering', () => {
    expect(sendGate('live', { ...open, dayOpen: false })).toBe('closed');
    expect(sendGate('live', { ...open, ordersEnabled: false })).toBe('off');
    expect(sendGate('live', { dayOpen: false, ordersEnabled: false })).toBe('off');
  });
});
