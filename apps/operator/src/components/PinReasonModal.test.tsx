import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../lib/i18n';
import { PinReasonModal } from './PinReasonModal';

const rpc = vi.fn();
vi.mock('../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));

function setup(extra: { entityId?: string; value?: number } = {}) {
  const onGranted = vi.fn();
  const onClose = vi.fn();
  render(
    <LocaleProvider>
      <PinReasonModal open action="void_line" {...extra} onGranted={onGranted} onClose={onClose} />
    </LocaleProvider>,
  );
  return { onGranted, onClose, user: userEvent.setup() };
}

beforeEach(() => rpc.mockReset());

describe('PinReasonModal', () => {
  it('calls verify_manager_pin and then onGranted with the reason', async () => {
    rpc.mockResolvedValue({ ok: true, authorized_by: 'mgr-1' });
    const { onGranted, user } = setup();
    await user.type(screen.getByLabelText('PIN'), '1234');
    await user.type(screen.getByLabelText('Reason'), 'spilled');
    await user.click(screen.getByRole('button', { name: 'Authorize' }));
    await waitFor(() => expect(onGranted).toHaveBeenCalledWith({ reason: 'spilled', authorizedBy: 'mgr-1' }));
    expect(rpc).toHaveBeenCalledWith('verify_manager_pin', { p_pin: '1234', p_action: 'void_line' });
  });

  it('binds the grant to the entity and value when given', async () => {
    rpc.mockResolvedValue({ ok: true, authorized_by: 'mgr-1' });
    const { onGranted, user } = setup({ entityId: 'line-9', value: 2500 });
    await user.type(screen.getByLabelText('PIN'), '1234');
    await user.type(screen.getByLabelText('Reason'), 'x');
    await user.click(screen.getByRole('button', { name: 'Authorize' }));
    await waitFor(() => expect(onGranted).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('verify_manager_pin', {
      p_pin: '1234',
      p_action: 'void_line',
      p_entity_id: 'line-9',
      p_value: 2500,
    });
  });

  it('shows the translated refusal and does not grant on a wrong PIN', async () => {
    rpc.mockResolvedValue({ ok: false, code: 'PIN_INVALID' });
    const { onGranted, user } = setup();
    await user.type(screen.getByLabelText('PIN'), '0000');
    await user.type(screen.getByLabelText('Reason'), 'x');
    await user.click(screen.getByRole('button', { name: 'Authorize' }));
    expect(await screen.findByText('Wrong PIN.')).toBeTruthy();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('asks for both fields before calling the server', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Authorize' }));
    expect(rpc).not.toHaveBeenCalled();
    expect(await screen.findByText('Enter the PIN and a reason.')).toBeTruthy();
  });
});
