import { describe, expect, it } from 'vitest';
import {
  RECHIME_MS,
  acceptFailure,
  callsByTable,
  initialChimeState,
  myTableIds,
  nextChime,
  sortInbox,
  urgency,
  waitedSeconds,
  type GuestInbox,
  type InboxCall,
  type InboxOrder,
} from './guestLogic';

const T0 = Date.parse('2026-11-26T18:00:00Z');
const at = (secondsAgo: number) => new Date(T0 - secondsAgo * 1000).toISOString();

function call(id: string, table: string, secondsAgo: number): InboxCall {
  return { id, table_id: table, table_label: table.toUpperCase(), reason: 'water', called_at: at(secondsAgo) };
}
function order(id: string, table: string, secondsAgo: number): InboxOrder {
  return {
    id,
    table_id: table,
    table_label: table.toUpperCase(),
    sent_at: at(secondsAgo),
    lines: [],
    total: 0,
    current_total: 0,
    price_changed: false,
    unavailable: false,
    table_has_tab: false,
  };
}

describe('waitedSeconds and urgency', () => {
  it('counts whole seconds since the guest asked, never below zero', () => {
    expect(waitedSeconds(at(90), T0)).toBe(90);
    expect(waitedSeconds(at(-5), T0)).toBe(0);
  });

  it('turns amber at 2 minutes and red at 5', () => {
    expect(urgency(0)).toBe('normal');
    expect(urgency(119)).toBe('normal');
    expect(urgency(120)).toBe('amber');
    expect(urgency(299)).toBe('amber');
    expect(urgency(300)).toBe('red');
  });
});

describe('sortInbox', () => {
  it('puts calls and orders in one list, oldest first', () => {
    const inbox: GuestInbox = {
      calls: [call('c1', 't1', 30), call('c2', 't2', 200)],
      orders: [order('o1', 't3', 100)],
    };
    expect(sortInbox(inbox, new Set()).map((e) => e.key)).toEqual(['call:c2', 'order:o1', 'call:c1']);
  });

  it('puts your own tables first, each group oldest first', () => {
    const inbox: GuestInbox = {
      calls: [call('c1', 't1', 300), call('c2', 't2', 10)],
      orders: [order('o1', 't2', 50), order('o2', 't3', 400)],
    };
    const sorted = sortInbox(inbox, new Set(['t2']));
    expect(sorted.map((e) => e.key)).toEqual(['order:o1', 'call:c2', 'order:o2', 'call:c1']);
    expect(sorted.map((e) => e.mine)).toEqual([true, true, false, false]);
  });

  it('breaks a tie in time by key, so the order is stable', () => {
    const inbox: GuestInbox = { calls: [call('b', 't1', 10), call('a', 't2', 10)], orders: [] };
    expect(sortInbox(inbox, new Set()).map((e) => e.key)).toEqual(['call:a', 'call:b']);
  });
});

describe('myTableIds', () => {
  it('is the tables whose open tab is mine', () => {
    const rows = [
      { table_id: 't1', waiter_id: 'me' },
      { table_id: 't2', waiter_id: 'other' },
      { table_id: 't3', waiter_id: null },
    ];
    expect([...myTableIds(rows, 'me')]).toEqual(['t1']);
    expect(myTableIds(rows, null).size).toBe(0);
  });
});

describe('callsByTable', () => {
  it('maps each calling table to when it called', () => {
    const m = callsByTable([call('c1', 't1', 30), call('c2', 't2', 60)]);
    expect(m.get('t1')).toBe(at(30));
    expect(m.get('t2')).toBe(at(60));
    expect(m.has('t3')).toBe(false);
  });
});

describe('nextChime (the re-chime rule)', () => {
  // `at` is when the guest asked, fixed; time moves through nowMs.
  const entry = (key: string, secondsBeforeT0: number) => ({ key, at: at(secondsBeforeT0) });

  it('stays quiet when nothing is waiting', () => {
    expect(nextChime(initialChimeState, [], T0).chime).toBeNull();
  });

  it('chimes once for something new, then stays quiet while it is fresh', () => {
    const c1 = entry('call:c1', 5);
    const first = nextChime(initialChimeState, [c1], T0);
    expect(first.chime).toBe('arrive');
    expect(nextChime(first.next, [c1], T0 + 10_000).chime).toBeNull();
  });

  it('chimes when another call or order arrives', () => {
    const c1 = entry('call:c1', 5);
    const first = nextChime(initialChimeState, [c1], T0);
    const second = nextChime(first.next, [c1, entry('order:o1', -9)], T0 + 10_000);
    expect(second.chime).toBe('arrive');
  });

  it('repeats every 60 seconds while something has waited over 5 minutes', () => {
    const c1 = entry('call:c1', 301);
    const first = nextChime(initialChimeState, [c1], T0);
    expect(first.chime).toBe('arrive');
    const soon = nextChime(first.next, [c1], T0 + RECHIME_MS - 1);
    expect(soon.chime).toBeNull();
    const due = nextChime(soon.next, [c1], T0 + RECHIME_MS);
    expect(due.chime).toBe('overdue');
    expect(nextChime(due.next, [c1], T0 + RECHIME_MS + 30_000).chime).toBeNull();
  });

  it('starts repeating once a wait crosses 5 minutes', () => {
    const c1 = entry('call:c1', 200);
    const first = nextChime(initialChimeState, [c1], T0);
    expect(nextChime(first.next, [c1], T0 + 90_000).chime).toBeNull(); // waited 290 s
    expect(nextChime(first.next, [c1], T0 + 100_000).chime).toBe('overdue'); // waited 300 s
  });

  it('forgets answered entries, so the next arrival chimes', () => {
    const first = nextChime(initialChimeState, [entry('call:c1', 5)], T0);
    const cleared = nextChime(first.next, [], T0 + 5_000);
    expect(cleared.chime).toBeNull();
    expect(cleared.next.seen.size).toBe(0);
    expect(nextChime(cleared.next, [entry('call:c2', -6)], T0 + 6_000).chime).toBe('arrive');
  });
});

describe('acceptFailure', () => {
  it('reads a menu change as "a dish is no longer available"', () => {
    for (const code of ['ITEM_NOT_AVAILABLE', 'MODIFIER_NOT_ALLOWED', 'MODIFIER_SELECTION_INVALID', 'INVALID_PRICE']) {
      expect(acceptFailure(code)).toBe('menu');
    }
  });

  it('reads a decided or expired order as gone', () => {
    expect(acceptFailure('GUEST_ORDER_NOT_PENDING')).toBe('gone');
    expect(acceptFailure('GUEST_ORDER_EXPIRED')).toBe('gone');
    expect(acceptFailure('GUEST_ORDER_NOT_FOUND')).toBe('gone');
  });

  it('asks for the guest count when the table turned out to have no tab', () => {
    expect(acceptFailure('COVERS_REQUIRED')).toBe('covers');
  });

  it('retries once when the table was taken meanwhile', () => {
    expect(acceptFailure('TABLE_OCCUPIED')).toBe('retry');
  });

  it('treats anything else as a plain error', () => {
    expect(acceptFailure('UNKNOWN')).toBe('other');
    expect(acceptFailure(undefined)).toBe('other');
  });
});
