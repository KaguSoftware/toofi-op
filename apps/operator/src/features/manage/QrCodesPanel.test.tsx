import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StaffRole } from '@rop/core';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';

const rpc = vi.fn();
let role: StaffRole = 'manager';
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ staff: { id: 's', fullName: 'S', role, venueId: 'v1' } }) }));

import { QrCodesPanel } from './QrCodesPanel';
import { qrModules, qrPath, tableUrl } from './qrLogic';

const TABLES = [
  { table_id: 't2', label: 'T2', area_id: 'a1', token: 'Token2Token2Token2Tok22', guest_enabled: true },
  { table_id: 't1', label: 'T1', area_id: 'a1', token: 'Token1Token1Token1Tok11', guest_enabled: false },
];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ToastProvider>
          <QrCodesPanel areaName={() => 'Hall'} />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const tokenReads = () => rpc.mock.calls.filter((c) => c[0] === 'table_qr_tokens').length;

beforeEach(() => {
  role = 'manager';
  vi.stubEnv('VITE_MENU_URL', 'https://menu.example.com');
  window.print = vi.fn();
  rpc.mockReset().mockImplementation(async (fn: string) => (fn === 'table_qr_tokens' ? TABLES : {}));
});
afterEach(() => vi.unstubAllEnvs());

describe('QR codes: who sees what', () => {
  it.each(['waiter', 'cashier'] as const)('a %s sees nothing and reads no tokens', async (r) => {
    role = r;
    setup();
    expect(screen.queryByRole('heading', { name: 'QR codes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /print/i })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a manager can print and switch, but cannot replace a code', async () => {
    setup();
    expect(isDisabled(await screen.findByRole('button', { name: 'Print all cards' }))).toBe(false);
    expect(isDisabled(screen.getByRole('button', { name: 'Print the card for table T1' }))).toBe(false);
    expect(screen.getAllByRole('group', { name: /Guests at table/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Replace the code/ })).toBeNull();
  });

  it('the owner can replace a code', async () => {
    role = 'owner';
    setup();
    expect(isDisabled(await screen.findByRole('button', { name: 'Replace the code for table T1' }))).toBe(false);
  });
});

describe('QR codes: the list', () => {
  it('lists tables in reading order, T1 before T2', async () => {
    setup();
    await screen.findByRole('button', { name: 'Print all cards' });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]?.textContent).toContain('T1');
    expect(rows[1]?.textContent).toContain('T2');
  });

  it('switching a table sends the flag and does not read the tokens again (every read is audited)', async () => {
    const user = setup();
    await screen.findByRole('button', { name: 'Print all cards' });
    const t1 = screen.getByRole('group', { name: 'Guests at table T1' });
    await user.click(within(t1).getByRole('button', { name: 'On' })); // T1 is off in the fixture
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_table_guest_enabled', { p_table_id: 't1', p_enabled: true }));
    expect(tokenReads()).toBe(1);
  });
});

describe('QR codes: printing', () => {
  it('prints one card whose code carries {menu site}/t/{token}', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Print the card for table T1' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const sheet = document.querySelector('.qr-sheet');
    expect(sheet?.querySelectorAll('.qr-card')).toHaveLength(1);
    expect(sheet?.querySelector('.qr-card')?.getAttribute('aria-label')).toBe('Table T1');
    expect(document.body.classList.contains('qr-printing')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.querySelector('.qr-sheet')).toBeNull());
    expect(document.body.classList.contains('qr-printing')).toBe(false);
  });

  it('the code on the card is the address {menu site}/t/{token}', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Print the card for table T1' }));
    const drawn = document.querySelector('.qr-card g path')?.getAttribute('d');
    expect(drawn).toBe(qrPath(qrModules(tableUrl('https://menu.example.com', 'Token1Token1Token1Tok11'))).d);
    window.dispatchEvent(new Event('afterprint'));
  });

  it('prints every table on its own page', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Print all cards' }));
    expect(document.querySelectorAll('.qr-sheet__page')).toHaveLength(2);
    window.dispatchEvent(new Event('afterprint'));
  });

  it('the card draws the code in black on white', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Print the card for table T1' }));
    const path = document.querySelector('.qr-card g path');
    expect(path?.getAttribute('fill')).toBe('black');
    expect(document.querySelector('.qr-card rect[fill="white"]')).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
  });
});

describe('QR codes: a production build refuses a dead address', () => {
  it.each([
    ['', 'The menu address is not set'],
    ['http://localhost:3000', 'points to this computer'],
    ['http://192.168.1.4:3000', 'points to this computer'],
  ])('with VITE_MENU_URL=%j it says so and prints nothing', async (url, text) => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_MENU_URL', url);
    setup();
    const notice = await screen.findByText(new RegExp(text));
    expect(notice.closest('[role="alert"]')).not.toBeNull();
    expect(isDisabled(screen.getByRole('button', { name: 'Print all cards' }))).toBe(true);
    expect(isDisabled(screen.getByRole('button', { name: 'Print the card for table T1' }))).toBe(true);
    expect(window.print).not.toHaveBeenCalled();
  });
});

describe('QR codes: replacing a code', () => {
  it('warns that the printed card stops working, then replaces and reads the new token once', async () => {
    role = 'owner';
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Replace the code for table T1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('The card printed for this table stops working');
    expect(dialog.textContent).toContain('guests at the table must scan the new one');
    expect(rpc).not.toHaveBeenCalledWith('rotate_table_token', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Replace code' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('rotate_table_token', { p_table_id: 't1' }));
    await waitFor(() => expect(tokenReads()).toBe(2));
  });

  it('cancel changes nothing', async () => {
    role = 'owner';
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Replace the code for table T1' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(rpc).not.toHaveBeenCalledWith('rotate_table_token', expect.anything());
  });
});
