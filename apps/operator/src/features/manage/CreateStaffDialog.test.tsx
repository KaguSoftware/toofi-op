import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';
import { CreateStaffDialog } from './CreateStaffDialog';
import { edgeErrorCode, validateCreateStaff } from './staffLogic';

const invoke = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

function setup() {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <ToastProvider>
          <CreateStaffDialog onClose={onClose} />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { onClose, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, over: Partial<Record<'name' | 'email' | 'pw', string>> = {}) {
  await user.type(screen.getByLabelText('Full name'), over.name ?? 'Sara Ali');
  await user.type(screen.getByLabelText('Email'), over.email ?? 'sara@example.com');
  await user.type(screen.getByLabelText('Temporary password'), over.pw ?? 'temp-pass-1');
  await user.selectOptions(screen.getByLabelText('Role'), 'waiter');
}

beforeEach(() => invoke.mockReset());

describe('create staff', () => {
  it('invokes staff-admin with the create action and closes on success', async () => {
    invoke.mockResolvedValue({ data: { staff_id: 's1' }, error: null });
    const { user, onClose } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('staff-admin', {
      body: { action: 'create', email: 'sara@example.com', password: 'temp-pass-1', full_name: 'Sara Ali', role: 'waiter' },
    });
  });

  it('shows inline errors and does not call the function while the form is invalid', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Temporary password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('The password must be at least 8 characters.')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and reports a server code such as EMAIL_TAKEN', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'EMAIL_TAKEN' }), { status: 409 }) },
    });
    const { user, onClose } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('A login with that email already exists.')).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('staffLogic', () => {
  it('validates the create form', () => {
    expect(validateCreateStaff({ email: 'a@b.co', password: '12345678', fullName: 'A', role: 'cashier' })).toEqual({});
    expect(Object.keys(validateCreateStaff({ email: 'x', password: '1', fullName: ' ', role: '' })).sort()).toEqual([
      'email',
      'fullName',
      'password',
      'role',
    ]);
  });
  it('reads the edge error code, else UNKNOWN', async () => {
    expect(await edgeErrorCode({ context: new Response('{"error":"FORBIDDEN"}') })).toBe('FORBIDDEN');
    expect(await edgeErrorCode({ context: new Response('<html>') })).toBe('UNKNOWN');
    expect(await edgeErrorCode(new Error('x'))).toBe('UNKNOWN');
  });
});
