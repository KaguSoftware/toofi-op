/**
 * The guest screen's order: adding dishes with and without options, the order sheet, sending
 * with one key per attempt, every refusal, and the strips that follow an order. The server is a
 * stub of guestApi; storage is jsdom's localStorage.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDEM_KEY_RE } from '@rop/core';
import type { GuestAnswer } from '@/lib/client/guestApi';
import type { GuestStatus } from '@/lib/callLogic';
import { guestCopy } from '@/lib/copyLogic';
import type { GroupView, MenuView } from '@/lib/menuViewLogic';
import { BASKET_STORAGE_KEY, ORDER_LATE_MS, serializeStored } from '@/lib/orderLogic';
import { GuestScreen, type GuestScreenProps } from './GuestScreen';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const api = vi.hoisted(() => ({ call: vi.fn(), order: vi.fn(), status: vi.fn(), setLocale: vi.fn() }));
vi.mock('@/lib/client/guestApi', () => ({ guestApi: api }));

const T0 = Date.parse('2026-11-26T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const en = guestCopy('en');
const ar = guestCopy('ar');

const side: GroupView = {
  id: 'g-side',
  name: 'Side',
  min: 1,
  max: 1,
  options: [
    { id: 'rice', name: 'Rice', delta: 0, deltaText: '' },
    { id: 'fries', name: 'Fries', delta: 1500, deltaText: '+1,500' },
  ],
};
const extras: GroupView = {
  id: 'g-extra',
  name: 'Extras',
  min: 0,
  max: 2,
  options: [
    { id: 'egg', name: 'Egg', delta: 1000, deltaText: '+1,000' },
    { id: 'cheese', name: 'Cheese', delta: 500, deltaText: '+500' },
    { id: 'pickle', name: 'Pickle', delta: 0, deltaText: '' },
  ],
};
const KEBAB = { id: 'kebab', name: 'Lamb Kebab', price: '15,000', unitPrice: 15000, photoUrl: null, groups: [side, extras] };
const HUMMUS = { id: 'hummus', name: 'Hummus', price: '4,000', unitPrice: 4000, photoUrl: 'https://img.example/h.webp', groups: [] };
const TABBOULEH = { id: 'tabbouleh', name: 'Tabbouleh', price: '5,000', unitPrice: 5000, photoUrl: null, groups: [] };
const MENU: MenuView = {
  venueName: 'Kagu Restaurant',
  sections: [
    { id: 'mezze', name: 'Mezze', icon: 'mezze', items: [HUMMUS, TABBOULEH] },
    { id: 'grills', name: 'Grills', icon: 'grill', items: [KEBAB] },
  ],
};
const MENU_AR: MenuView = { ...MENU, sections: MENU.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })) };

const status = (patch: Partial<GuestStatus> = {}): GuestStatus => ({ tableLabel: '5', dayOpen: true, callsEnabled: true, ordersEnabled: true, call: null, callAgainAt: null, orders: [], ...patch });
function setup(over: Partial<GuestScreenProps> = {}) {
  const props: GuestScreenProps = { copy: en, locale: 'en', venueName: 'Kagu Restaurant', menuState: 'ok', menu: MENU, initialStatus: status(), initialSession: 'live', serverNow: T0, ...over };
  return { ...render(<GuestScreen {...props} />), props };
}
const ok = <T,>(data: T): GuestAnswer<T> => ({ ok: true, data });
const refused = (result: string, code: string | null): GuestAnswer<never> => ({ ok: false, result: result as never, code });
const statusBody = (orders: unknown[] = [], extra: Record<string, unknown> = {}) =>
  ok({ table_label: '5', day_open: true, calls_enabled: true, orders_enabled: true, call: null, call_again_at: null, orders, server_now: iso(T0), ...extra });
const sentBody = (id = 'o1', total = 4000) => ok({ guest_order_id: id, status: 'pending', lines: [], total, sent_at: iso(T0) });
const orderRow = (id: string, state: string, sentAt = T0) => ({ id, status: state, sent_at: iso(sentAt), lines: [], total: 4000 });

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
  api.status.mockResolvedValue(statusBody());
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const dialog = () => screen.getByRole('dialog');
// The menu's rows only: an open sheet may name the same dish.
const row = (name: string) => within(document.querySelector('main.list') as HTMLElement).getByText(name).closest('li') as HTMLElement;
const plus = (name: string) => within(row(name)).getByRole('button', { name: new RegExp(`^(Add one|Choose options for) ${name}$`) });
const minus = (name: string) => within(row(name)).getByRole('button', { name: `Remove one ${name}` });
const bar = () => screen.getByRole('button', { name: /^Your order/ });
const tap = (el: HTMLElement) => fireEvent.click(el);
const noteField = () => within(dialog()).getByRole('textbox') as HTMLTextAreaElement;
/** Text as read aloud: without the direction marks and no-break spaces the Arabic currency format carries. */
const plain = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u200e\u200f]/g, '').replace(/\u00a0/g, ' ');
const settle = async () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const openOrder = () => tap(bar());
const sendButton = () => within(dialog()).getByRole('button', { name: en.order.send }) as HTMLButtonElement;
const sentRequest = (call = 0) => api.order.mock.calls[call]?.[0] as Array<Record<string, unknown>>;
const sentKey = (call = 0) => api.order.mock.calls[call]?.[1] as string;

describe('adding dishes', () => {
  it('plus adds one: the row gets minus, a count and a filled plus, and the bar shows the count and the total', () => {
    setup();
    tap(plus('Hummus'));
    expect(within(row('Hummus')).getByText('1')).toBeTruthy();
    expect(plus('Hummus').className).toContain('round--filled');
    expect(bar().className).toContain('bar__order--ready');
    expect(bar().textContent).toContain('1 dish · 4,000 IQD');
    tap(plus('Hummus'));
    tap(plus('Tabbouleh'));
    expect(bar().textContent).toContain('3 dishes · 13,000 IQD');
  });
  it('two taps in the same frame both count', () => {
    setup();
    const button = plus('Hummus');
    tap(button);
    tap(button);
    expect(within(row('Hummus')).getByText('2')).toBeTruthy();
  });
  it('minus takes one off, and the last one puts the row and the bar back', () => {
    setup();
    tap(plus('Hummus'));
    tap(plus('Hummus'));
    tap(minus('Hummus'));
    expect(within(row('Hummus')).getByText('1')).toBeTruthy();
    tap(minus('Hummus'));
    expect(within(row('Hummus')).queryAllByRole('button')).toHaveLength(1);
    expect(bar().textContent).toContain(en.bar.orderEmpty);
    expect(bar().className).not.toContain('bar__order--ready');
  });
  it('stops at 20 of one dish and says so in plain words', () => {
    setup();
    for (let i = 0; i < 21; i++) tap(plus('Hummus'));
    expect(within(row('Hummus')).getByText('20')).toBeTruthy();
    expect(screen.getByText(en.errors.byCode.INVALID_QTY!)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText(en.errors.byCode.INVALID_QTY!)).toBeNull();
  });
  it('keeps the order on the phone when the page is opened again', () => {
    const first = setup();
    tap(plus('Hummus'));
    tap(plus('Tabbouleh'));
    first.unmount();
    setup();
    expect(within(row('Hummus')).getByText('1')).toBeTruthy();
    expect(bar().textContent).toContain('2 dishes · 9,000 IQD');
  });
  it('with no table the menu still takes an order', () => {
    setup({ initialStatus: null, initialSession: 'none' });
    tap(plus('Hummus'));
    expect(bar().textContent).toContain('1 dish');
  });
  it('without a readable menu there is no Your order button, and the order waits on the phone', () => {
    window.localStorage.setItem(BASKET_STORAGE_KEY, serializeStored({ lines: [{ itemId: 'hummus', qty: 1, modifierIds: [] }], note: '', attempt: null }, T0));
    setup({ menuState: 'error', menu: null });
    expect(screen.queryByRole('button', { name: /^Your order/ })).toBeNull();
    expect(window.localStorage.getItem(BASKET_STORAGE_KEY)).toContain('hummus');
  });
});

describe('dishes with options', () => {
  const open = () => tap(plus('Lamb Kebab'));
  const add = () => within(dialog()).getByRole('button', { name: new RegExp(`^${en.order.options.add}`) }) as HTMLButtonElement;
  const tile = (name: string) => within(dialog()).getByRole('button', { name: new RegExp(`^${name}`) }) as HTMLButtonElement;

  it('the plus opens the options sheet first, with each group and its limits', () => {
    setup();
    open();
    expect(within(dialog()).getByRole('heading', { name: 'Lamb Kebab' })).toBeTruthy();
    expect(within(dialog()).getByText('Side')).toBeTruthy();
    expect(within(dialog()).getByText('Choose 1')).toBeTruthy();
    expect(within(dialog()).getByText('Optional, up to 2')).toBeTruthy();
    expect(bar().textContent).toContain(en.bar.orderEmpty);
  });
  it('will not add until every required group has its choice, and says why', () => {
    setup();
    open();
    expect(add().disabled).toBe(true);
    expect(within(dialog()).getByText(en.errors.byCode.MODIFIER_SELECTION_INVALID!)).toBeTruthy();
    tap(tile('Rice'));
    expect(add().disabled).toBe(false);
  });
  it('a one-of group swaps its choice; a many-of group stops at its maximum', () => {
    setup();
    open();
    tap(tile('Rice'));
    tap(tile('Fries'));
    expect(tile('Rice').getAttribute('aria-pressed')).toBe('false');
    expect(tile('Fries').getAttribute('aria-pressed')).toBe('true');
    tap(tile('Egg'));
    tap(tile('Cheese'));
    expect(tile('Pickle').disabled).toBe(true);
    tap(tile('Egg'));
    expect(tile('Pickle').disabled).toBe(false);
  });
  it('adds the line with its options and quantity, closes, and mirrors the price', () => {
    setup();
    open();
    tap(tile('Fries'));
    tap(tile('Egg'));
    tap(within(dialog()).getByRole('button', { name: 'Add one Lamb Kebab' }));
    expect(add().textContent).toContain('35,000'); // (15,000 + 1,500 + 1,000) × 2
    tap(add());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(row('Lamb Kebab')).getByText('2')).toBeTruthy();
    expect(bar().textContent).toContain('2 dishes · 35,000 IQD');
  });
  it('the same dish with different options is a second line', () => {
    setup();
    open();
    tap(tile('Rice'));
    tap(add());
    open();
    tap(tile('Fries'));
    tap(add());
    openOrder();
    expect(within(dialog()).getAllByText('Lamb Kebab')).toHaveLength(2);
    expect(within(row('Lamb Kebab')).getByText('2')).toBeTruthy();
  });
  it('the dish\'s minus takes one off its most recent line', () => {
    setup();
    open();
    tap(tile('Rice'));
    tap(add());
    tap(minus('Lamb Kebab'));
    expect(bar().textContent).toContain(en.bar.orderEmpty);
  });
  it('refuses a 21st of a line inside the sheet', () => {
    setup();
    open();
    tap(tile('Rice'));
    for (let i = 0; i < 19; i++) tap(within(dialog()).getByRole('button', { name: 'Add one Lamb Kebab' }));
    tap(add());
    open();
    tap(tile('Rice'));
    tap(add());
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.byCode.INVALID_QTY);
    expect(within(row('Lamb Kebab')).getByText('20')).toBeTruthy();
  });
});

describe('the order sheet', () => {
  it('says how to add dishes when empty, with Send recessed and disabled', () => {
    setup();
    openOrder();
    expect(within(dialog()).getByText(en.order.empty)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    expect(within(dialog()).getByText(en.order.confirm)).toBeTruthy();
  });
  it('lists each line with its stepper and total, the table beside the title, and the order total', () => {
    setup();
    tap(plus('Hummus'));
    tap(plus('Hummus'));
    tap(plus('Tabbouleh'));
    openOrder();
    expect(within(dialog()).getByText('Table 5')).toBeTruthy();
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog()).getByText('8,000')).toBeTruthy();
    expect(within(dialog()).getByText('13,000 IQD')).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });
  it('the steppers change the order, and the last minus removes the line', () => {
    setup();
    tap(plus('Hummus'));
    openOrder();
    tap(within(dialog()).getByRole('button', { name: 'Add one Hummus' }));
    expect(within(dialog()).getByText('8,000 IQD')).toBeTruthy();
    tap(within(dialog()).getByRole('button', { name: 'Remove one Hummus' }));
    tap(within(dialog()).getByRole('button', { name: 'Remove one Hummus' }));
    expect(within(dialog()).getByText(en.order.empty)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });
  it('takes a note of 140 characters, with the counter only near the limit', () => {
    setup();
    tap(plus('Hummus'));
    openOrder();
    const note = noteField();
    fireEvent.change(note, { target: { value: 'a'.repeat(50) } });
    expect(within(dialog()).queryByText(/left$/)).toBeNull();
    fireEvent.change(note, { target: { value: 'a'.repeat(120) } });
    expect(within(dialog()).getByText('20 left')).toBeTruthy();
    fireEvent.change(note, { target: { value: 'a'.repeat(200) } });
    expect(note.value).toHaveLength(140);
    expect(within(dialog()).getByText('0 left')).toBeTruthy();
  });
  it('keeps the note with the order on the phone', () => {
    const first = setup();
    tap(plus('Hummus'));
    openOrder();
    fireEvent.change(noteField(), { target: { value: 'no onions' } });
    first.unmount();
    setup();
    openOrder();
    expect(noteField().value).toBe('no onions');
  });
  it('cannot send while offline, and says so', () => {
    setup();
    tap(plus('Hummus'));
    openOrder();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(sendButton().disabled).toBe(true);
    expect(within(dialog()).getByText(en.offline)).toBeTruthy();
  });
  it('Send order is the one terra cotta control while the sheet is open', () => {
    const { container } = setup();
    tap(plus('Hummus'));
    openOrder();
    expect(sendButton().className).toContain('action--terra');
    // The bar behind the scrim is inert, and its CSS recesses the terra button then.
    expect(container.querySelector('.guest__body')?.hasAttribute('inert')).toBe(true);
  });
});

describe('sending', () => {
  it('sends ids, quantities, option ids and the note under one key, never a price; then clears the order and shows the strip', async () => {
    api.order.mockResolvedValue(sentBody('o1', 23000));
    api.status.mockResolvedValue(statusBody([orderRow('o1', 'pending')]));
    setup();
    tap(plus('Hummus'));
    tap(plus('Hummus'));
    tap(plus('Lamb Kebab'));
    tap(within(dialog()).getByRole('button', { name: /^Fries/ }));
    tap(within(dialog()).getByRole('button', { name: new RegExp(`^${en.order.options.add}`) }));
    openOrder();
    fireEvent.change(noteField(), { target: { value: '  no   onions ' } });
    await act(async () => void tap(sendButton()));
    expect(api.order).toHaveBeenCalledTimes(1);
    expect(sentRequest()).toEqual([
      { menu_item_id: 'hummus', qty: 2, modifier_ids: [], note: 'no onions' },
      { menu_item_id: 'kebab', qty: 1, modifier_ids: ['fries'], note: null },
    ]);
    expect(sentKey()).toMatch(IDEM_KEY_RE);
    expect(JSON.stringify(api.order.mock.calls)).not.toMatch(/price|total|delta|15000|4000/i);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bar().textContent).toContain(en.bar.orderEmpty);
    expect(screen.getByText(en.order.strip.waiting)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(BASKET_STORAGE_KEY)!)).toMatchObject({ lines: [], note: '', attempt: null });
  });
  it('a double tap on Send sends once, and the sheet is locked while the answer is unknown', async () => {
    let answer!: (v: GuestAnswer<unknown>) => void;
    api.order.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    setup();
    tap(plus('Hummus'));
    openOrder();
    await act(async () => {
      tap(sendButton());
      tap(sendButton());
    });
    expect(api.order).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByText(en.order.sending)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    expect((within(dialog()).getByRole('button', { name: en.sheet.close }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog()).getByRole('button', { name: 'Add one Hummus' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => answer(sentBody()));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('after a dropped reply keeps the order, says the outcome is unclear, and a retry sends the same key', async () => {
    api.order.mockResolvedValueOnce(refused('error', null)).mockResolvedValueOnce(sentBody());
    setup();
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    expect(within(dialog()).getByText(en.order.unclear)).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
    expect(within(dialog()).getByText('4,000 IQD')).toBeTruthy();
    await act(async () => void tap(sendButton()));
    expect(api.order).toHaveBeenCalledTimes(2);
    expect(sentKey(1)).toBe(sentKey(0));
    expect(sentRequest(1)).toEqual(sentRequest(0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('a changed order after an unclear send gets a new key', async () => {
    api.order.mockResolvedValueOnce(refused('error', null)).mockResolvedValueOnce(sentBody());
    setup();
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    tap(within(dialog()).getByRole('button', { name: 'Add one Hummus' }));
    await act(async () => void tap(sendButton()));
    expect(sentKey(1)).not.toBe(sentKey(0));
  });
  it('a refresh in the middle of a send keeps the key: the reopened page says unclear and sends the same one', async () => {
    api.order.mockResolvedValueOnce(refused('error', null));
    const first = setup();
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    first.unmount();
    api.order.mockResolvedValueOnce(sentBody());
    setup();
    openOrder();
    expect(within(dialog()).getByText(en.order.unclear)).toBeTruthy();
    await act(async () => void tap(sendButton()));
    expect(sentKey(1)).toBe(sentKey(0));
  });
  it('a clean refusal ends the attempt: the next send has a new key', async () => {
    api.order.mockResolvedValueOnce(refused('limit', 'TOO_MANY_PENDING_ORDERS')).mockResolvedValueOnce(sentBody());
    setup();
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    await act(async () => void tap(sendButton()));
    expect(sentKey(1)).not.toBe(sentKey(0));
  });
});

describe('when the server says no', () => {
  const sendOne = async () => {
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
  };
  it('3 orders already waiting: a plain sentence in the sheet, the order kept', async () => {
    api.order.mockResolvedValue(refused('limit', 'TOO_MANY_PENDING_ORDERS'));
    setup();
    await sendOne();
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.byCode.TOO_MANY_PENDING_ORDERS);
    expect(within(dialog()).getByText('4,000 IQD')).toBeTruthy();
  });
  it('40 lines: a plain sentence too', async () => {
    api.order.mockResolvedValue(refused('limit', 'TOO_MANY_ITEMS'));
    setup();
    await sendOne();
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.byCode.TOO_MANY_ITEMS);
  });
  it('restaurant closed: the closed sheet, the order kept', async () => {
    api.order.mockResolvedValue(refused('closed', 'DAY_NOT_OPEN'));
    setup();
    await sendOne();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.closed.title);
    tap(within(dialog()).getByRole('button', { name: en.sheet.close }));
    expect(screen.getByText(en.notice.closed)).toBeTruthy();
    expect(bar().textContent).toContain('1 dish');
  });
  it('ordering switched off: says so, and the menu stops offering the plus; the order is kept', async () => {
    api.order.mockResolvedValue(refused('off', 'GUEST_ORDERS_OFF'));
    setup();
    await sendOne();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.order.ordersOff.title);
    tap(within(dialog()).getByRole('button', { name: en.sheet.close }));
    expect(screen.queryByRole('button', { name: /^Your order/ })).toBeNull();
    expect(within(row('Hummus')).queryAllByRole('button')).toHaveLength(0);
    expect(window.localStorage.getItem(BASKET_STORAGE_KEY)).toContain('hummus');
  });
  it('an ended table session: asks for a scan and keeps the order', async () => {
    api.order.mockResolvedValue(refused('expired', 'SESSION_EXPIRED'));
    setup();
    await sendOne();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.expired.title);
    expect(within(dialog()).getByText(new RegExp('stays on this phone'))).toBeTruthy();
    tap(within(dialog()).getByRole('button', { name: en.sheet.close }));
    expect(screen.getByText(en.notice.scanAgain)).toBeTruthy();
    openOrder();
    expect(within(dialog()).getByText('4,000 IQD')).toBeTruthy();
    // With the session over, sending only explains.
    api.order.mockClear();
    await act(async () => void tap(sendButton()));
    expect(api.order).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.expired.title);
  });
  it('no table: Send explains that the table\'s code is needed, without asking the server, and keeps the order', async () => {
    setup({ initialStatus: null, initialSession: 'none' });
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    expect(api.order).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.scan.title);
    tap(within(dialog()).getByRole('button', { name: en.sheet.close }));
    expect(bar().textContent).toContain('1 dish');
  });
  it('a closed day known from the status is explained before asking the server', async () => {
    setup({ initialStatus: status({ dayOpen: false }) });
    tap(plus('Hummus'));
    openOrder();
    await act(async () => void tap(sendButton()));
    expect(api.order).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.closed.title);
  });
  it('a switched-off status hides Your order and the plus from the start', () => {
    setup({ initialStatus: status({ ordersEnabled: false }) });
    expect(screen.queryByRole('button', { name: /^Your order/ })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(en.bar.callWaiter) })).toBeTruthy();
    expect(screen.getAllByRole('listitem').every((li) => within(li).queryAllByRole('button').length === 0)).toBe(true);
  });
  it('a dish that went unavailable: the menu is refreshed, and the line is marked so it can be removed', async () => {
    api.order.mockResolvedValue(refused('stale-menu', 'ITEM_NOT_AVAILABLE'));
    const { rerender, props } = setup();
    tap(plus('Hummus'));
    tap(plus('Tabbouleh'));
    openOrder();
    await act(async () => void tap(sendButton()));
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.byCode.ITEM_NOT_AVAILABLE);
    expect(refresh).toHaveBeenCalledTimes(1);
    // The page re-renders with the menu the server now has: no hummus.
    const without: MenuView = { ...MENU, sections: [{ ...MENU.sections[0]!, items: [TABBOULEH] }, MENU.sections[1]!] };
    rerender(<GuestScreen {...props} menu={without} />);
    const lines = within(dialog()).getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getAllByText(en.order.line.unavailable).length).toBeGreaterThan(0);
    expect(sendButton().disabled).toBe(true);
    expect(within(dialog()).getByText(en.order.fix)).toBeTruthy();
    expect(within(dialog()).getByText('5,000 IQD')).toBeTruthy(); // the marked line is left out of the total
    expect(within(lines[0]!).getByText('Hummus')).toBeTruthy(); // named from the snapshot taken when it was added
    tap(within(lines[0]!).getByRole('button', { name: 'Remove Hummus from the order' }));
    expect(sendButton().disabled).toBe(false);
  });
  it('an option that changed marks its line too', () => {
    window.localStorage.setItem(BASKET_STORAGE_KEY, serializeStored({ lines: [{ itemId: 'kebab', qty: 1, modifierIds: ['rice', 'gone'] }], note: '', attempt: null }, T0));
    setup();
    openOrder();
    expect(within(dialog()).getByText(en.order.line.options)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });
});

describe('after sending: the strips', () => {
  const pending = (at = T0) => status({ orders: [{ id: 'o1', status: 'pending', sentAt: at, total: 4000 }] });

  it('polls every 5 seconds only while an order is pending, then stops', async () => {
    api.status
      .mockResolvedValueOnce(statusBody([orderRow('o1', 'pending')]))
      .mockResolvedValueOnce(statusBody([orderRow('o1', 'pending')]))
      .mockResolvedValue(statusBody([orderRow('o1', 'accepted')], { server_now: iso(T0 + 10_000) }));
    setup({ initialStatus: pending() });
    expect(screen.getByText(en.order.strip.waiting)).toBeTruthy();
    await settle();
    expect(api.status).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.status).toHaveBeenCalledTimes(2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.status).toHaveBeenCalledTimes(3);
    expect(screen.getByText(en.order.strip.accepted)).toBeTruthy();
    expect(screen.queryByText(en.order.strip.waiting)).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(api.status).toHaveBeenCalledTimes(3);
  });
  it('asks the server at all only when something is waiting', async () => {
    setup({ initialStatus: status({ orders: [{ id: 'o1', status: 'accepted', sentAt: T0, total: 1 }] }) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(api.status).not.toHaveBeenCalled();
  });
  it('adds "ask a waiter" after 3 minutes pending', async () => {
    api.status.mockResolvedValue(statusBody([orderRow('o1', 'pending')], { server_now: iso(T0 + ORDER_LATE_MS) }));
    setup({ initialStatus: pending() });
    expect(screen.queryByText(en.order.strip.late)).toBeNull();
    await settle();
    expect(screen.getByText(en.order.strip.late)).toBeTruthy();
    expect(screen.queryByText(en.order.strip.waiting)).toBeNull();
  });
  it.each([
    ['accepted', en.order.strip.accepted],
    ['declined', en.order.strip.declined],
    ['expired', en.order.strip.expired],
  ])('shows a %s order, and the guest can dismiss it', (state, text) => {
    setup({ initialStatus: status({ orders: [{ id: 'o1', status: state as never, sentAt: T0, total: 1 }] }) });
    expect(screen.getByText(text)).toBeTruthy();
    tap(screen.getByRole('button', { name: en.order.strip.dismiss }));
    expect(screen.queryByText(text)).toBeNull();
  });
  it('declined and expired tell the guest to ask a waiter', () => {
    expect(en.order.strip.declined).toMatch(/ask a waiter/i);
    expect(en.order.strip.expired).toMatch(/ask a waiter/i);
  });
  it('shows nothing about orders once the session has ended', async () => {
    api.status.mockResolvedValue(refused('expired', 'SESSION_EXPIRED'));
    setup({ initialStatus: pending() });
    await settle();
    expect(screen.queryByText(en.order.strip.waiting)).toBeNull();
    expect(screen.getByText(en.notice.scanAgain)).toBeTruthy();
  });
});

describe('in Arabic', () => {
  const arabic = () => setup({ copy: ar, locale: 'ar', menu: MENU_AR });
  it('words the bar, the sheet and the total in Arabic, and counts with the Arabic plural forms', () => {
    arabic();
    const add = (name: string) => screen.getByRole('button', { name: `أضف واحدًا من ${name}` });
    tap(add('Hummus'));
    expect(plain(screen.getByRole('button', { name: /^طلبك/ }))).toContain('طبق واحد · 4,000 د.ع.');
    tap(add('Hummus'));
    expect(plain(screen.getByRole('button', { name: /^طلبك/ }))).toContain('طبقان');
    tap(add('Tabbouleh'));
    expect(plain(screen.getByRole('button', { name: /^طلبك/ }))).toContain('3 أطباق');
    tap(screen.getByRole('button', { name: /^طلبك/ }));
    expect(within(dialog()).getByRole('button', { name: ar.order.send })).toBeTruthy();
    expect(within(dialog()).getByText(ar.order.confirm)).toBeTruthy();
    expect(within(dialog()).getByText(ar.order.total)).toBeTruthy();
    expect(within(dialog()).getByText('طاولة 5')).toBeTruthy();
  });
  it('shows the Arabic strips', () => {
    setup({ copy: ar, locale: 'ar', initialStatus: status({ orders: [{ id: 'o1', status: 'declined', sentAt: T0, total: 1 }] }) });
    expect(screen.getByText(ar.order.strip.declined)).toBeTruthy();
  });
  it('says the outcome is unclear in Arabic', async () => {
    api.order.mockResolvedValue(refused('error', null));
    arabic();
    tap(screen.getByRole('button', { name: 'أضف واحدًا من Hummus' }));
    tap(screen.getByRole('button', { name: /^طلبك/ }));
    await act(async () => void tap(within(dialog()).getByRole('button', { name: ar.order.send })));
    expect(within(dialog()).getByText(ar.order.unclear)).toBeTruthy();
  });
  it('explains a limit in Arabic', async () => {
    api.order.mockResolvedValue(refused('limit', 'TOO_MANY_PENDING_ORDERS'));
    arabic();
    tap(screen.getByRole('button', { name: 'أضف واحدًا من Hummus' }));
    tap(screen.getByRole('button', { name: /^طلبك/ }));
    await act(async () => void tap(within(dialog()).getByRole('button', { name: ar.order.send })));
    expect(within(dialog()).getByRole('alert').textContent).toBe(ar.errors.byCode.TOO_MANY_PENDING_ORDERS);
  });
});
