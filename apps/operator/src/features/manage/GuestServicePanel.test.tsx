import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StaffRole } from '@rop/core';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';

const rpc = vi.fn();
const selectRows = vi.fn();
let role: StaffRole = 'manager';
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ staff: { id: 's', fullName: 'S', role, venueId: 'v1' } }) }));
vi.mock('./shared', async () => ({ ...(await vi.importActual<object>('./shared')), selectRows: (...a: unknown[]) => selectRows(...a) }));

import { GuestServicePanel } from './GuestServicePanel';

function setup() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocaleProvider>
        <ToastProvider>
          <GuestServicePanel />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  role = 'manager';
  rpc.mockReset().mockResolvedValue({});
  selectRows.mockReset().mockResolvedValue([{ guest_calls_enabled: true, guest_orders_enabled: true }]);
});

describe('venue-wide guest switches', () => {
  it.each(['waiter', 'cashier'] as const)('are not shown to a %s', (r) => {
    role = r;
    setup();
    expect(screen.queryByRole('heading', { name: 'Guest service' })).toBeNull();
    expect(selectRows).not.toHaveBeenCalled();
  });

  it('show the current state to a manager', async () => {
    selectRows.mockResolvedValue([{ guest_calls_enabled: true, guest_orders_enabled: false }]);
    setup();
    const calls = await screen.findByRole('group', { name: 'Guests can call a waiter' });
    const orders = screen.getByRole('group', { name: 'Guests can send orders' });
    expect(within(calls).getByRole('button', { name: 'On' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(orders).getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('turning orders off sends both flags and keeps calls as they were', async () => {
    const user = setup();
    const orders = await screen.findByRole('group', { name: 'Guests can send orders' });
    await user.click(within(orders).getByRole('button', { name: 'Off' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_guest_service', { p_calls_enabled: true, p_orders_enabled: false }));
  });

  it('turning calls off keeps ordering as it was', async () => {
    selectRows.mockResolvedValue([{ guest_calls_enabled: true, guest_orders_enabled: false }]);
    const user = setup();
    const calls = await screen.findByRole('group', { name: 'Guests can call a waiter' });
    await user.click(within(calls).getByRole('button', { name: 'Off' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_guest_service', { p_calls_enabled: false, p_orders_enabled: false }));
  });
});
