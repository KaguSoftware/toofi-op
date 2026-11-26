import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDEM_KEY_RE } from '@rop/core';
import type { GuestAnswer } from '@/lib/client/guestApi';
import { ANSWERED_STRIP_MS, type GuestCall, type GuestStatus } from '@/lib/callLogic';
import { guestCopy } from '@/lib/copyLogic';
import type { MenuView } from '@/lib/menuViewLogic';
import { GuestScreen, type GuestScreenProps } from './GuestScreen';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const api = vi.hoisted(() => ({ call: vi.fn(), status: vi.fn(), setLocale: vi.fn() }));
vi.mock('@/lib/client/guestApi', () => ({ guestApi: api }));

const T0 = Date.parse('2026-11-26T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const en = guestCopy('en');
const ar = guestCopy('ar');

const MENU: MenuView = {
  venueName: 'Kagu Restaurant',
  sections: [
    {
      id: 'mezze',
      name: 'Mezze',
      icon: 'mezze',
      items: [
        { id: 'hummus', name: 'Hummus', price: '4,000', photoUrl: 'https://img.example/h.webp' },
        { id: 'tabbouleh', name: 'Tabbouleh', price: '5,000', photoUrl: null },
      ],
    },
    { id: 'grills', name: 'Grills', icon: 'grill', items: [{ id: 'kebab', name: 'Lamb Kebab', price: '15,000', photoUrl: null }] },
  ],
};

const status = (patch: Partial<GuestStatus> = {}): GuestStatus => ({ tableLabel: '5', dayOpen: true, callsEnabled: true, ordersEnabled: true, call: null, callAgainAt: null, ...patch });
const waiting: GuestCall = { id: 'c1', reason: 'bill', status: 'waiting', calledAt: T0 - 5000, answeredAt: null };

function setup(over: Partial<GuestScreenProps> = {}) {
  return render(
    <GuestScreen copy={en} locale="en" venueName="Kagu Restaurant" menuState="ok" menu={MENU} initialStatus={status()} initialSession="live" serverNow={T0} {...over} />,
  );
}
const ok = <T,>(data: T): GuestAnswer<T> => ({ ok: true, data });
const refused = (result: string, code: string | null): GuestAnswer<never> => ({ ok: false, result: result as never, code });
const statusBody = (call: unknown = null, extra: Record<string, unknown> = {}) =>
  ok({ table_label: '5', day_open: true, calls_enabled: true, orders_enabled: true, call, call_again_at: null, server_now: iso(T0), ...extra });
const raisedBody = ok({ call_id: 'c1', status: 'waiting', reason: 'bill', called_at: iso(T0), already: false });

beforeEach(() => {
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

const callButton = () => screen.getByRole('button', { name: new RegExp(`^${en.bar.callWaiter}`) });
const dialog = () => screen.getByRole('dialog');

describe('the menu', () => {
  it('shows the table plate, the restaurant name, a section per category and a row per dish', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kagu Restaurant');
    expect(screen.getByRole('img', { name: 'Table 5' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Mezze', 'Grills']);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('15,000')).toBeTruthy();
  });
  it('browses with no table: no plate, no currency on a row', () => {
    setup({ initialStatus: null, initialSession: 'none' });
    expect(screen.queryByRole('img', { name: /^Table/ })).toBeNull();
    expect(screen.getAllByRole('listitem')[0]?.textContent).not.toMatch(/IQD|د\.ع/);
  });
  it('draws the category icon in the dish tile when there is no photo, and the photo when there is one', () => {
    const { container } = setup();
    expect(container.querySelectorAll('img.row__photo')).toHaveLength(1);
    expect(container.querySelectorAll('.row__photo--none svg')).toHaveLength(2);
  });
  it('falls back to the tile when a photo fails to load', () => {
    const { container } = setup();
    fireEvent.error(container.querySelector('img.row__photo')!);
    expect(container.querySelectorAll('img.row__photo')).toHaveLength(0);
    expect(container.querySelectorAll('.row__photo--none')).toHaveLength(3);
  });
  it('says so when the menu failed, with a way to retry, never a blank page', () => {
    setup({ menuState: 'error', menu: null });
    expect(screen.getByRole('alert').textContent).toContain(en.menu.failed);
    expect((screen.getByRole('link', { name: en.menu.retry }) as HTMLAnchorElement).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('says so when the menu is empty', () => {
    setup({ menuState: 'empty', menu: { venueName: 'Kagu Restaurant', sections: [] } });
    expect(screen.getByText(en.menu.empty)).toBeTruthy();
  });
  it('shows Arabic with the other language on the button', () => {
    setup({ copy: ar, locale: 'ar' });
    expect(screen.getByRole('button', { name: 'English' }).textContent).toBe('EN');
    expect(screen.getByRole('img', { name: 'طاولة 5' })).toBeTruthy();
  });
});

describe('the bottom bar', () => {
  it('has Call waiter and an empty, inactive Your order', () => {
    setup();
    const order = screen.getByRole('button', { name: /Your order/ }) as HTMLButtonElement;
    expect(order.textContent).toContain(en.bar.orderEmpty);
    expect(order.disabled).toBe(true);
  });
  it('leaves Call waiter out when calls are switched off', () => {
    setup({ initialStatus: status({ callsEnabled: false }) });
    expect(screen.queryByRole('button', { name: new RegExp(en.bar.callWaiter) })).toBeNull();
    expect(screen.getByRole('button', { name: /Your order/ })).toBeTruthy();
  });
});

describe('call waiter: the states', () => {
  it('asks for a scan when there is no table', () => {
    setup({ initialStatus: null, initialSession: 'none' });
    fireEvent.click(callButton());
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.scan.title);
    expect(api.call).not.toHaveBeenCalled();
  });
  it('says the session ended, with the strip and the sheet', () => {
    setup({ initialStatus: null, initialSession: 'expired' });
    expect(screen.getByText(en.notice.scanAgain)).toBeTruthy();
    fireEvent.click(callButton());
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.expired.title);
  });
  it('says service is closed when no business day is open', () => {
    setup({ initialStatus: status({ dayOpen: false }) });
    expect(screen.getByText(en.notice.closed)).toBeTruthy();
    fireEvent.click(callButton());
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.sheet.closed.title);
  });
  it('shows the wait before calling again, counting down, and explains it on tap', () => {
    setup({ initialStatus: status({ callAgainAt: T0 + 102_000 }) });
    expect(callButton().textContent).toContain('Again in 1:42');
    fireEvent.click(callButton());
    expect(within(dialog()).getByText('You can call again in 1:42.')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(2000));
    expect(within(dialog()).getByText('You can call again in 1:40.')).toBeTruthy();
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(callButton().textContent).toContain('Again in 1:40');
  });
  it('goes back to ready when the wait ends', () => {
    setup({ initialStatus: status({ callAgainAt: T0 + 3000 }) });
    act(() => void vi.advanceTimersByTime(3000));
    expect(callButton().textContent).not.toContain('Again in');
    fireEvent.click(callButton());
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.call.title);
  });
});

describe('call waiter: the sheet', () => {
  it('offers the four reasons and says which table the waiter will come to', () => {
    setup();
    fireEvent.click(callButton());
    expect(within(dialog()).getAllByRole('button', { name: /^(To order|The bill|Water|Help)$/ })).toHaveLength(4);
    expect(within(dialog()).getByText('A waiter will come to table 5.')).toBeTruthy();
  });
  it('sends the reason with an idempotency key, closes, and shows the waiting strip', async () => {
    api.call.mockResolvedValue(raisedBody);
    api.status.mockResolvedValue(statusBody({ id: 'c1', reason: 'bill', status: 'waiting', called_at: iso(T0), answered_at: null }));
    setup();
    fireEvent.click(callButton());
    await act(async () => void fireEvent.click(within(dialog()).getByRole('button', { name: 'The bill' })));
    expect(api.call).toHaveBeenCalledWith('bill', expect.stringMatching(IDEM_KEY_RE));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(en.strip.callWaiting)).toBeTruthy();
  });
  it('keeps the same key when the connection drops, and uses a fresh one after the server answered', async () => {
    api.call.mockResolvedValueOnce(refused('error', null)).mockResolvedValueOnce(raisedBody);
    setup();
    fireEvent.click(callButton());
    await act(async () => void fireEvent.click(within(dialog()).getByRole('button', { name: 'Water' })));
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.generic);
    await act(async () => void fireEvent.click(within(dialog()).getByRole('button', { name: 'Water' })));
    expect(api.call.mock.calls[1]?.[1]).toBe(api.call.mock.calls[0]?.[1]);
  });
  it('explains a refusal in the sheet, in the guest wording', async () => {
    api.call.mockResolvedValue(refused('limit', 'TOO_MANY_REQUESTS'));
    setup();
    fireEvent.click(callButton());
    await act(async () => void fireEvent.click(within(dialog()).getByRole('button', { name: 'Help' })));
    expect(within(dialog()).getByRole('alert').textContent).toBe(en.errors.byCode.TOO_MANY_REQUESTS);
    expect(within(dialog()).getByRole('heading').textContent).toBe(en.call.title);
  });
  it.each([
    ['expired', 'SESSION_EXPIRED', en.sheet.expired.title],
    ['closed', 'DAY_NOT_OPEN', en.sheet.closed.title],
    ['off', 'GUEST_CALLS_OFF', en.sheet.off.title],
    ['too-soon', 'CALL_TOO_SOON', en.sheet.tooSoon.title],
  ])('turns a %s answer into its explaining sheet', async (result, code, title) => {
    api.call.mockResolvedValue(refused(result, code));
    setup();
    fireEvent.click(callButton());
    await act(async () => void fireEvent.click(within(dialog()).getByRole('button', { name: 'Water' })));
    expect(within(dialog()).getByRole('heading').textContent).toBe(title);
  });
  it('cannot send while offline, and says so', () => {
    setup();
    fireEvent.click(callButton());
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    act(() => void window.dispatchEvent(new Event('offline')));
    expect((within(dialog()).getByRole('button', { name: 'Water' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(en.offline).length).toBeGreaterThan(0);
  });
  it('closes on Escape and the close button, and gives focus back to Call waiter', () => {
    setup();
    callButton().focus();
    fireEvent.click(callButton());
    fireEvent.click(within(dialog()).getByRole('button', { name: en.sheet.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => void vi.advanceTimersByTime(0));
    expect(document.activeElement).toBe(callButton());
  });
});

describe('call waiter: waiting and answered', () => {
  it('shows the waiting strip and asks the server every 5 seconds, only while waiting', async () => {
    api.status
      .mockResolvedValueOnce(statusBody({ id: 'c1', reason: 'bill', status: 'waiting', called_at: iso(T0 - 5000), answered_at: null }))
      .mockResolvedValueOnce(statusBody({ id: 'c1', reason: 'bill', status: 'waiting', called_at: iso(T0 - 5000), answered_at: null }))
      .mockResolvedValue(statusBody({ id: 'c1', reason: 'bill', status: 'answered', called_at: iso(T0 - 5000), answered_at: iso(T0 + 8000) }, { server_now: iso(T0 + 10_000) }));
    setup({ initialStatus: status({ call: waiting }) });
    expect(screen.getByText(en.strip.callWaiting)).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(api.status).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.status).toHaveBeenCalledTimes(2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.status).toHaveBeenCalledTimes(3);
    expect(screen.getByText(en.strip.callAnswered)).toBeTruthy();
    expect(screen.queryByText(en.strip.callWaiting)).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(api.status).toHaveBeenCalledTimes(3);
  });
  it('does not ask the server at all when nothing is waiting', async () => {
    setup();
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(api.status).not.toHaveBeenCalled();
  });
  it('shows "on the way" for two minutes after the answer, then goes quiet', () => {
    const answered: GuestCall = { ...waiting, status: 'answered', answeredAt: T0 - 1000 };
    setup({ initialStatus: status({ call: answered }) });
    expect(screen.getByText(en.strip.callAnswered)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(ANSWERED_STRIP_MS));
    expect(screen.queryByText(en.strip.callAnswered)).toBeNull();
  });
  it('turns to "scan again" when the session ends while a call is waiting', async () => {
    api.status.mockResolvedValue(refused('expired', 'SESSION_EXPIRED'));
    setup({ initialStatus: status({ call: waiting }) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getByText(en.notice.scanAgain)).toBeTruthy();
    expect(screen.queryByText(en.strip.callWaiting)).toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(api.status).toHaveBeenCalledTimes(1);
  });
});

describe('offline, language, rail', () => {
  it('shows an offline banner while the phone has no connection', () => {
    setup();
    expect(screen.queryByText(en.offline)).toBeNull();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(en.offline)).toBeTruthy();
  });
  it('switches language through the server and refreshes the page', async () => {
    api.setLocale.mockResolvedValue(ok({ locale: 'ar' }));
    setup();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'العربية' })));
    expect(api.setLocale).toHaveBeenCalledWith('ar');
    expect(refresh).toHaveBeenCalled();
  });
  it('scrolls to a section when its tile is tapped, and marks the tile', () => {
    setup();
    const tiles = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(tiles[0]?.getAttribute('aria-current')).toBe('true');
    fireEvent.click(tiles[1]!);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    expect(tiles[1]?.getAttribute('aria-current')).toBe('true');
    expect(tiles[0]?.getAttribute('aria-current')).toBeNull();
  });
  it('makes the page behind a sheet inert while it is open', () => {
    const { container } = setup();
    fireEvent.click(callButton());
    expect(container.querySelector('.guest__body')?.hasAttribute('inert')).toBe(true);
  });
});
