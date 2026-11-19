import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';
import { ShiftScreen } from './ShiftScreen';

const rpc = vi.fn();
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ staff: { id: 'me', fullName: 'Sara', role: 'cashier', venueId: 'v1' } }),
}));
const openShifts = vi.fn();
vi.mock('./tillData', () => ({ fetchOpenShifts: () => openShifts() }));

const mine = {
  shiftId: 's1',
  staffId: 'me',
  staffName: 'Sara',
  deviceId: 'D1',
  openedAt: '2026-11-19T06:00:00Z',
  openingFloat: 20000,
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ToastProvider>
          <ShiftScreen />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  rpc.mockReset();
  openShifts.mockReset();
});

describe('ShiftScreen', () => {
  it('closes with a blind count: expected cash appears only after the server answers', async () => {
    openShifts.mockResolvedValue([mine]);
    rpc.mockResolvedValue({
      shift_id: 's1',
      opening_float: 20000,
      counted_cash: 5000,
      expected_cash: 12000,
      variance: -7000,
    });
    const user = setup();
    await screen.findByRole('heading', { name: 'Close your shift' });
    expect(screen.queryByText('Expected cash')).toBeNull();

    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '000' }));
    await user.click(screen.getByRole('button', { name: 'Close shift' }));
    const dialog = screen.getByRole('dialog');
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText('Expected cash')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Close shift' }));

    expect(await screen.findByText('Expected cash')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('close_till_shift', { p_counted_cash: 5000 });
    const result = screen.getByRole('heading', { name: 'Shift closed' }).closest('section') as HTMLElement;
    expect(result.textContent).toContain('12,000');
    expect(result.textContent).toContain('5,000');
    expect(result.textContent).toContain('Short');
    expect(result.textContent).toContain('7,000');
  });

  it('offers to open a shift with an opening float when there is none', async () => {
    openShifts.mockResolvedValue([]);
    rpc.mockResolvedValue({ shift_id: 's9' });
    const user = setup();
    await screen.findByRole('heading', { name: 'Open your shift' });
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '000' }));
    await user.click(screen.getByRole('button', { name: 'Open shift' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('open_till_shift', expect.objectContaining({ p_opening_float: 5000 })),
    );
  });

  it('records a drawer opening with a reason', async () => {
    openShifts.mockResolvedValue([mine]);
    rpc.mockResolvedValue({ event_id: 'e1' });
    const user = setup();
    await screen.findByRole('heading', { name: 'Open the drawer' });
    await user.type(screen.getByLabelText('Reason'), 'change for customer');
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('record_drawer_open', { p_reason: 'change for customer' }));
  });
});
