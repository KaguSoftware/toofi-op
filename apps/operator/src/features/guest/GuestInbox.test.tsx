import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { GuestInbox } from './GuestInbox';
import type * as AppRpcModule from '../../lib/appRpc';
import type { GuestInbox as Inbox, InboxCall, InboxOrder } from './guestLogic';

const h = vi.hoisted(() => ({
  inbox: { calls: [], orders: [] } as Inbox,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  /** Per function: errors to throw, in order, before succeeding. */
  fail: {} as Record<string, string[]>,
  chime: vi.fn(),
  armed: true,
  idem: 0,
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/appRpc', async (importOriginal) => {
  const real = await importOriginal<typeof AppRpcModule>();
  return {
    ...real,
    appRpc: (fn: string, args: Record<string, unknown> = {}) => {
      h.calls.push({ fn, args });
      if (fn === 'guest_inbox') return Promise.resolve(structuredClone(h.inbox));
      const code = h.fail[fn]?.shift();
      if (code) return Promise.reject(new real.AppRpcError(code, code, 'P0001'));
      if (fn === 'answer_waiter_call') {
        h.inbox.calls = h.inbox.calls.filter((c) => c.id !== args.p_call_id);
        return Promise.resolve({ already: false });
      }
      if (fn === 'accept_guest_order' || fn === 'decline_guest_order') {
        h.inbox.orders = h.inbox.orders.filter((o) => o.id !== args.p_guest_order_id);
        return Promise.resolve({ already: false });
      }
      return Promise.reject(new Error(`unexpected ${fn}`));
    },
  };
});
vi.mock('../floor/floorData', () => ({
  fetchStatus: () => Promise.resolve([{ table_id: 't5', seats: 6, waiter_id: null }]),
}));
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ staff: { id: 'me', role: 'waiter', venueId: 'v1', fullName: 'Sara' } }),
}));
vi.mock('../../lib/realtime', () => ({ useBroadcast: () => undefined }));
vi.mock('../../lib/audio', () => ({
  chime: h.chime,
  useAudioArming: () => ({ armed: h.armed, arm: () => undefined }),
}));
vi.mock('../../lib/idem', () => ({ newIdem: (type: string) => `TEST:${type}:${++h.idem}` }));

const now = () => new Date().toISOString();
const call = (over: Partial<InboxCall> = {}): InboxCall => ({
  id: 'c1', table_id: 't5', table_label: '5', reason: 'bill', called_at: now(), ...over,
});
const order = (over: Partial<InboxOrder> = {}): InboxOrder => ({
  id: 'o1',
  table_id: 't5',
  table_label: '5',
  sent_at: now(),
  lines: [
    { menu_item_id: 'm1', name_en: 'Tea', name_ar: 'شاي', qty: 2, unit_price: 1000, line_total: 2000, note: 'No sugar', modifiers: [] },
  ],
  total: 2000,
  current_total: 2000,
  price_changed: false,
  unavailable: false,
  table_has_tab: false,
  ...over,
});
const rpc = (fn: string) => h.calls.filter((c) => c.fn === fn);
/** The row's own error line (the error toast region is also role="alert"). */
const rowError = () => screen.findByText((_, el) => !!el?.matches('.guest-inbox .rop-field__error'));

function setup(props: { hidden?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ToastProvider>
          <GuestInbox {...props} />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { qc, user, view };
}

beforeEach(() => {
  h.inbox = { calls: [], orders: [] };
  h.calls = [];
  h.fail = {};
  h.chime.mockReset();
  h.armed = true;
  localStorage.clear();
});

describe('GuestInbox calls', () => {
  it('shows a call with its table, reason and wait, and OK answers it', async () => {
    h.inbox.calls = [call()];
    const { user } = setup();
    expect(await screen.findByText('Table 5')).toBeTruthy();
    expect(screen.getByText('Asks for the bill')).toBeTruthy();
    expect(screen.getByText('Waiting under a minute')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'OK, table 5' }));
    expect(rpc('answer_waiter_call')[0]?.args).toEqual({ p_call_id: 'c1' });
    await waitFor(() => expect(screen.queryByText('Table 5')).toBeNull());
  });

  it('chimes when a call arrives', async () => {
    h.inbox.calls = [call()];
    setup();
    await screen.findByText('Table 5');
    await waitFor(() => expect(h.chime).toHaveBeenCalledWith('arrive'));
  });

  it('hides the list behind the idle lock but still chimes', async () => {
    h.inbox.calls = [call()];
    setup({ hidden: true });
    await waitFor(() => expect(h.chime).toHaveBeenCalledWith('arrive'));
    expect(screen.queryByText('Table 5')).toBeNull();
  });

  it('offers to turn on sound when the browser has not allowed it yet', async () => {
    h.armed = false;
    setup();
    expect(await screen.findByRole('button', { name: /Turn on sound/ })).toBeTruthy();
  });
});

describe('GuestInbox orders', () => {
  it('shows the lines and total, and notes a price change', async () => {
    h.inbox.orders = [order({ price_changed: true, current_total: 2500, table_has_tab: true })];
    setup();
    expect(await screen.findByText('Tea')).toBeTruthy();
    expect(screen.getByText('Note: No sugar')).toBeTruthy();
    expect(screen.getByText(/Prices changed since the guest sent it/)).toBeTruthy();
  });

  it('on a free table asks for the guest count, then accepts with it and refreshes the tab screens', async () => {
    h.inbox.orders = [order()];
    const { user, qc } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guests at table 5' });
    expect((within(dialog).getByLabelText('Number of guests', { selector: 'input' }) as HTMLInputElement).value).toBe('6');
    qc.setQueryData(QK.tabTotals('tab1'), {});
    await user.click(within(dialog).getByRole('button', { name: '3' }));
    await user.click(within(dialog).getByRole('button', { name: 'Accept order' }));
    await waitFor(() => expect(rpc('accept_guest_order')).toHaveLength(1));
    const args = rpc('accept_guest_order')[0]?.args;
    expect(args).toMatchObject({ p_guest_order_id: 'o1', p_covers: 3 });
    expect(args?.p_idempotency_key).toMatch(/^TEST:guest_accept:/);
    expect(await screen.findByText('Order from table 5 added to the tab.')).toBeTruthy();
    expect(qc.getQueryState(QK.tabTotals('tab1'))?.isInvalidated).toBe(true);
  });

  it('on a table with a tab accepts in one tap, with no guest count', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    await waitFor(() => expect(rpc('accept_guest_order')).toHaveLength(1));
    expect(rpc('accept_guest_order')[0]?.args).toMatchObject({ p_covers: null });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uses a new key for each tap', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    h.fail.accept_guest_order = ['UNKNOWN'];
    const { user } = setup();
    const ok = await screen.findByRole('button', { name: 'Accept the order from table 5' });
    await user.click(ok);
    await rowError();
    await user.click(screen.getByRole('button', { name: 'Accept the order from table 5' }));
    await waitFor(() => expect(rpc('accept_guest_order')).toHaveLength(2));
    const [a, b] = rpc('accept_guest_order');
    expect(a?.args.p_idempotency_key).not.toBe(b?.args.p_idempotency_key);
  });

  it('retries once with the same key when the table was taken meanwhile', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    h.fail.accept_guest_order = ['TABLE_OCCUPIED'];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    await screen.findByText('Order from table 5 added to the tab.');
    const [a, b] = rpc('accept_guest_order');
    expect(rpc('accept_guest_order')).toHaveLength(2);
    expect(b?.args.p_idempotency_key).toBe(a?.args.p_idempotency_key);
  });

  it('says so when a dish went off the menu and leaves Decline as the way out', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    h.fail.accept_guest_order = ['ITEM_NOT_AVAILABLE'];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    expect((await rowError()).textContent).toMatch(/no longer available, so it cannot be added/);
    expect(screen.getByRole('button', { name: 'Decline the order from table 5' })).toBeTruthy();
  });

  it('asks for the guest count when the tab closed meanwhile', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    h.fail.accept_guest_order = ['COVERS_REQUIRED'];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    expect(await screen.findByRole('dialog', { name: 'Guests at table 5' })).toBeTruthy();
  });

  it('shows the server reason when someone else already decided the order', async () => {
    h.inbox.orders = [order({ table_has_tab: true })];
    h.fail.accept_guest_order = ['GUEST_ORDER_NOT_PENDING'];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Accept the order from table 5' }));
    await waitFor(() => expect(rpc('guest_inbox').length).toBeGreaterThan(1));
    expect(screen.getAllByRole('alert').some((n) => n.textContent)).toBe(true);
  });

  it('declines only after the confirm', async () => {
    h.inbox.orders = [order()];
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Decline the order from table 5' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline the order from table 5?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(rpc('decline_guest_order')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Decline the order from table 5' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Decline the order from table 5?' })).getByRole('button', {
        name: 'Decline order',
      }),
    );
    await waitFor(() => expect(rpc('decline_guest_order')[0]?.args).toEqual({ p_guest_order_id: 'o1' }));
    await waitFor(() => expect(screen.queryByText('Tea')).toBeNull());
  });
});
