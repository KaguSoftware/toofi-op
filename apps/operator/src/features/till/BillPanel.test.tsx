import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { BillPanel } from './BillPanel';

const server = vi.hoisted(() => ({ total: 21000, paid: [] as number[] }));
const totals = () => {
  const paid = server.paid.reduce((a, b) => a + b, 0);
  return { subtotal: server.total, discount: 0, tax: 0, total: server.total, paid, refunded: 0, due: server.total - paid };
};
vi.mock('../../lib/appRpc', () => ({
  appRpc: (_fn: string, args: { p_amount: number; p_tab_id: string }) => {
    server.paid.push(args.p_amount);
    return Promise.resolve({ payment_id: 'p', tab_id: args.p_tab_id, method: 'cash', amount: args.p_amount, tendered: args.p_amount, change: 0, status: 'open', totals: totals() });
  },
}));
vi.mock('./tillData', () => ({
  fetchReceiptSettings: () => Promise.resolve(null),
  fetchBill: () =>
    Promise.resolve({ tabId: 't1', status: 'open', tableLabel: 'T1', openedAt: '2026-11-24T10:00:00Z', closedAt: null, lines: [], payments: [], totals: totals() }),
}));

beforeEach(() => {
  server.paid = [];
  localStorage.clear();
});

describe('BillPanel part payments', () => {
  it('marks the floor and the tab stale after every part payment, without waiting for realtime', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <ToastProvider>
            <BillPanel tabId="t1" role="cashier" shiftOpen onBack={() => undefined} backLabel="Back" />
          </ToastProvider>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    const amount = await screen.findByLabelText('Amount to pay');
    let due = 21000;
    for (const pay of [5000, 5000, 3000]) {
      qc.setQueryData(QK.floorStatus(), []);
      qc.setQueryData(QK.tabTotals('t1'), {});
      await user.clear(amount);
      await user.type(amount, String(pay));
      await user.click(screen.getByRole('button', { name: 'Exact' }));
      await user.click(screen.getByRole('button', { name: 'Take payment' }));
      due -= pay;
      await waitFor(() => expect((amount as HTMLInputElement).value).toBe(String(due)));
      expect(qc.getQueryState(QK.floorStatus())?.isInvalidated).toBe(true);
      expect(qc.getQueryState(QK.tabTotals('t1'))?.isInvalidated).toBe(true);
    }
    expect(server.paid).toEqual([5000, 5000, 3000]);
  });
});
