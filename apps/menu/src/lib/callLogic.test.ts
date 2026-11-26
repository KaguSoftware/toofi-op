import { describe, expect, it } from 'vitest';
import { ANSWERED_STRIP_MS, callButton, callOutcome, callStrip, formatCountdown, needsClock, parseGuestStatus, type GuestCall, type GuestStatus } from './callLogic';

const T0 = Date.parse('2026-11-26T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const status = (patch: Partial<GuestStatus> = {}): GuestStatus => ({
  tableLabel: '5',
  dayOpen: true,
  callsEnabled: true,
  ordersEnabled: true,
  call: null,
  callAgainAt: null,
  orders: [],
  ...patch,
});
const waiting: GuestCall = { id: 'c1', reason: 'bill', status: 'waiting', calledAt: T0, answeredAt: null };
const answered: GuestCall = { ...waiting, status: 'answered', answeredAt: T0 + 30_000 };

describe('parseGuestStatus', () => {
  it('reads the table, the switches, the call and the cooldown', () => {
    const parsed = parseGuestStatus({
      table_label: '5',
      day_open: true,
      calls_enabled: true,
      orders_enabled: false,
      call: { id: 'c1', reason: 'water', status: 'answered', called_at: iso(T0), answered_at: iso(T0 + 5000) },
      call_again_at: iso(T0 + 120_000),
      orders: [],
    });
    expect(parsed).toEqual({
      tableLabel: '5',
      dayOpen: true,
      callsEnabled: true,
      ordersEnabled: false,
      call: { id: 'c1', reason: 'water', status: 'answered', calledAt: T0, answeredAt: T0 + 5000 },
      callAgainAt: T0 + 120_000,
      orders: [],
    });
  });
  it('treats no call and no cooldown as null', () => {
    const parsed = parseGuestStatus({ table_label: '5', day_open: false, calls_enabled: true, orders_enabled: true, call: null, call_again_at: null });
    expect(parsed?.call).toBeNull();
    expect(parsed?.callAgainAt).toBeNull();
    expect(parsed?.dayOpen).toBe(false);
  });
  it('drops a call it cannot read and refuses a body with no table', () => {
    expect(parseGuestStatus({ table_label: '5', call: { id: 'c1', reason: 'pizza', status: 'waiting' } })?.call).toBeNull();
    expect(parseGuestStatus({ call: null })).toBeNull();
    expect(parseGuestStatus(null)).toBeNull();
  });
});

describe('callButton', () => {
  const live = (patch?: Partial<GuestStatus>, now = T0) => callButton({ session: 'live', status: status(patch), now });
  it('asks for a scan with no table or an ended session', () => {
    expect(callButton({ session: 'none', status: null, now: T0 })).toEqual({ kind: 'scan', why: 'no-table' });
    expect(callButton({ session: 'expired', status: null, now: T0 })).toEqual({ kind: 'scan', why: 'expired' });
  });
  it('is ready on a live table', () => {
    expect(live()).toEqual({ kind: 'ready' });
  });
  it('says service is closed when no business day is open', () => {
    expect(live({ dayOpen: false })).toEqual({ kind: 'closed' });
  });
  it('is off, and left out, when calls are switched off', () => {
    expect(live({ callsEnabled: false })).toEqual({ kind: 'off' });
    // Switched off wins over closed: there is nothing to explain about a day.
    expect(live({ callsEnabled: false, dayOpen: false })).toEqual({ kind: 'off' });
  });
  it('shows the time left while the wait before calling again runs', () => {
    expect(live({ callAgainAt: T0 + 90_000 })).toEqual({ kind: 'wait', msLeft: 90_000 });
    expect(live({ callAgainAt: T0 + 90_000 }, T0 + 90_000)).toEqual({ kind: 'ready' });
    expect(live({ callAgainAt: T0 + 90_000 }, T0 + 200_000)).toEqual({ kind: 'ready' });
  });
});

describe('callStrip', () => {
  it('has nothing to say with no call', () => {
    expect(callStrip(null, T0)).toBeNull();
  });
  it('says waiting while the call is open, however old', () => {
    expect(callStrip(waiting, T0 + 3_600_000)).toBe('waiting');
  });
  it('says on the way for two minutes after the answer, then goes quiet', () => {
    expect(callStrip(answered, T0 + 31_000)).toBe('answered');
    expect(callStrip(answered, answered.answeredAt! + ANSWERED_STRIP_MS - 1)).toBe('answered');
    expect(callStrip(answered, answered.answeredAt! + ANSWERED_STRIP_MS)).toBeNull();
  });
});

describe('needsClock', () => {
  it('ticks only while a countdown or a timed strip is on screen', () => {
    expect(needsClock(null, T0)).toBe(false);
    expect(needsClock(status(), T0)).toBe(false);
    expect(needsClock(status({ callAgainAt: T0 + 1000 }), T0)).toBe(true);
    expect(needsClock(status({ callAgainAt: T0 - 1000 }), T0)).toBe(false);
    expect(needsClock(status({ call: answered }), T0 + 31_000)).toBe(true);
    expect(needsClock(status({ call: answered }), answered.answeredAt! + ANSWERED_STRIP_MS)).toBe(false);
    expect(needsClock(status({ call: waiting }), T0)).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('counts up to the next whole second as m:ss', () => {
    expect(formatCountdown(102_000)).toBe('1:42');
    expect(formatCountdown(101_001)).toBe('1:42');
    expect(formatCountdown(59_000)).toBe('0:59');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('callOutcome', () => {
  const refused = (result: string, code: string | null) => ({ ok: false as const, result: result as never, code });
  it('turns a raised call into the waiting call', () => {
    const out = callOutcome({ ok: true, data: { call_id: 'c9', status: 'waiting', reason: 'help', called_at: iso(T0), already: false } });
    expect(out).toEqual({ kind: 'raised', call: { id: 'c9', reason: 'help', status: 'waiting', calledAt: T0, answeredAt: null } });
  });
  it('reads an unreadable success as a generic failure, never as a raised call', () => {
    expect(callOutcome({ ok: true, data: { nonsense: 1 } })).toEqual({ kind: 'message', code: null });
  });
  it('maps each refusal to what the screen does next', () => {
    expect(callOutcome(refused('expired', 'SESSION_EXPIRED'))).toEqual({ kind: 'expired' });
    expect(callOutcome(refused('closed', 'DAY_NOT_OPEN'))).toEqual({ kind: 'closed' });
    expect(callOutcome(refused('off', 'GUEST_CALLS_OFF'))).toEqual({ kind: 'off' });
    expect(callOutcome(refused('too-soon', 'CALL_TOO_SOON'))).toEqual({ kind: 'too-soon' });
    expect(callOutcome(refused('limit', 'TOO_MANY_REQUESTS'))).toEqual({ kind: 'message', code: 'TOO_MANY_REQUESTS' });
    expect(callOutcome(refused('error', null))).toEqual({ kind: 'message', code: null });
  });
});
