import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../../lib/i18n';
import { PaymentPane } from './PaymentPane';

const rpc = vi.fn();
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));

const settled = {
  payment_id: 'p1',
  tab_id: 't1',
  method: 'cash',
  amount: 5000,
  tendered: 10000,
  change: 5000,
  status: 'settled',
  totals: { subtotal: 5000, discount: 0, tax: 0, total: 5000, paid: 5000, refunded: 0, due: 0 },
};

function setup(props: Partial<Parameters<typeof PaymentPane>[0]> = {}) {
  const onPaid = vi.fn();
  render(
    <LocaleProvider>
      <PaymentPane tabId="t1" due={5000} suggested={5000} shiftOpen onPaid={onPaid} {...props} />
    </LocaleProvider>,
  );
  return { onPaid, user: userEvent.setup() };
}

beforeEach(() => rpc.mockReset());

describe('PaymentPane', () => {
  it('disables Pay while the payment is submitting and sends it only once', async () => {
    let finish: (v: unknown) => void = () => undefined;
    rpc.mockReturnValue(new Promise((r) => (finish = r)));
    const { onPaid, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    const pay = screen.getByRole('button', { name: 'Take payment' });
    expect((pay as HTMLButtonElement).disabled).toBe(false);
    await user.click(pay);
    const busy = await screen.findByRole('button', { name: 'Taking payment…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await user.click(busy);
    expect(rpc).toHaveBeenCalledTimes(1);
    finish(settled);
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ change: 5000, settled: true })));
  });

  it('keeps the same idempotency key when the same payment is retried after a failure', async () => {
    rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(settled);
    const { onPaid, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('rechecks the bill after an unclear failure and keeps the key when nothing landed, even if tendered changes', async () => {
    rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(settled);
    const onRecheck = vi.fn().mockResolvedValue(5000);
    const { user } = setup({ onRecheck });
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /10,000/ }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys[0]).toBe(keys[1]);
  });

  it('blocks Pay while the recheck is pending and when it cannot be read', async () => {
    rpc.mockRejectedValueOnce(new Error('network'));
    const onRecheck = vi.fn().mockRejectedValue(new Error('offline'));
    const { user } = setup({ onRecheck });
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    expect(await screen.findByText(/Could not check the bill/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Take payment' }) as HTMLButtonElement).disabled).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('starts a new payment key when the recheck shows the first one landed', async () => {
    rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(settled);
    const onRecheck = vi.fn().mockResolvedValue(0);
    const { user } = setup({ onRecheck });
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await waitFor(() => expect(onRecheck).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('turns cash off without a shift but still allows card', async () => {
    rpc.mockResolvedValue({ ...settled, method: 'card', tendered: null, change: 0 });
    const { user } = setup({ shiftOpen: false });
    await user.click(screen.getByRole('button', { name: 'Exact' }));
    expect((screen.getByRole('button', { name: 'Take payment' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Open your shift to take cash.')).toBeTruthy();
    await user.click(screen.getByLabelText('Card'));
    await user.click(screen.getByRole('button', { name: 'Take payment' }));
    expect(rpc).toHaveBeenCalledWith(
      'settle_tab',
      expect.objectContaining({ p_method: 'card', p_amount: 5000, p_tendered: null }),
    );
  });

  it('shows the change live from the quick notes', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /10,000/ }));
    expect(screen.getByText(/Change/).textContent).toContain('5,000');
  });
});
