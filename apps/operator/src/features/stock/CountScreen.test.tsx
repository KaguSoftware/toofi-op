import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';
import { AUTOSAVE_MS, CountScreen } from './CountScreen';

const rpc = vi.fn();
const selectRows = vi.fn();
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock('../manage/shared', async () => {
  const actual: Record<string, unknown> = await vi.importActual('../manage/shared');
  return { ...actual, selectRows: (...a: unknown[]) => selectRows(...a) };
});

// Rows deliberately carry on-hand style fields: a leak would show up in the page.
const EXPECTED = 7771.5;
const ONHAND = 8882.25;

function stubReads() {
  selectRows.mockImplementation(async (table: string) => {
    if (table === 'stock_counts') return [{ id: 'c1', finalized_at: null }];
    if (table === 'stock_count_lines') return [{ ingredient_id: 'i1', counted: 4, expected: EXPECTED }];
    if (table === 'ingredients')
      return [
        { id: 'i1', name_en: 'Rice', name_ar: 'رز', unit: 'g', on_hand: ONHAND, expected: EXPECTED },
        { id: 'i2', name_en: 'Milk', name_ar: 'حليب', unit: 'ml', on_hand: ONHAND, expected: EXPECTED },
      ];
    return [];
  });
}

function setup() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocaleProvider>
        <ToastProvider>
          <CountScreen />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  selectRows.mockReset();
  stubReads();
});
afterEach(() => vi.useRealTimers());

describe('blind count screen', () => {
  it('renders an input per active ingredient and no expected or on-hand quantity', async () => {
    setup();
    await screen.findByLabelText('Counted quantity of Rice in g');
    expect(screen.getByLabelText('Counted quantity of Milk in ml')).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const leaked of ['7771', '7,771', '8882', '8,882', 'expected', 'on hand', 'On hand']) {
      expect(text).not.toContain(leaked);
    }
    for (const input of screen.getAllByRole('textbox') as HTMLInputElement[]) {
      expect(input.value).not.toMatch(/7771|8882/);
    }
  });

  it('never asks the database for expected or on-hand columns', async () => {
    setup();
    await screen.findByLabelText('Counted quantity of Rice in g');
    for (const [, columns] of selectRows.mock.calls as [string, string][]) {
      expect(columns).not.toMatch(/expected|on_hand|on-hand/);
    }
    expect(selectRows.mock.calls.map((c) => c[0])).not.toContain('v_ingredient_on_hand');
  });

  it('shows what was already counted and autosaves edits after a pause', async () => {
    rpc.mockResolvedValue({ saved: 1 });
    setup();
    const rice = (await screen.findByLabelText('Counted quantity of Rice in g')) as HTMLInputElement;
    await waitFor(() => expect(rice.value).toBe('4'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const milk = screen.getByLabelText('Counted quantity of Milk in ml');
    await user.type(milk, '12.5');
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 50);
    });
    expect(rpc).toHaveBeenCalledWith('save_count_lines', { p_count_id: 'c1', p_lines: [{ ingredient_id: 'i2', counted: 12.5 }] });
  });
});
