import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../../lib/i18n';
import { BasketPanel } from './BasketPanel';
import { ItemSheet } from './ItemSheet';
import { addLine, emptyBasket, type ModifierGroup } from './basketLogic';

const opt = (id: string, name: string, priceDelta = 0) => ({ id, nameEn: name, nameAr: name, priceDelta });
const size: ModifierGroup = {
  id: 'size',
  nameEn: 'Size',
  nameAr: 'Size',
  minSelect: 1,
  maxSelect: 1,
  modifiers: [opt('s', 'Small'), opt('l', 'Large', 500)],
};
const extras: ModifierGroup = {
  id: 'extras',
  nameEn: 'Extras',
  nameAr: 'Extras',
  minSelect: 0,
  maxSelect: 2,
  modifiers: [opt('a', 'Ice'), opt('b', 'Lemon'), opt('c', 'Mint')],
};
const item = { id: 'tea', nameEn: 'Tea', nameAr: 'Tea', price: 1000 };

function sheet(onAdd = vi.fn()) {
  render(
    <LocaleProvider>
      <ItemSheet item={item} groups={[size, extras]} onAdd={onAdd} onClose={vi.fn()} />
    </LocaleProvider>,
  );
  return { onAdd, user: userEvent.setup() };
}

describe('ItemSheet modifier rules', () => {
  it('keeps Add disabled until a required group is satisfied', async () => {
    const { user, onAdd } = sheet();
    const add = screen.getByRole('button', { name: /Add to basket/ });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Choose at least 1.')).toBeTruthy();
    await user.click(screen.getByLabelText(/Large/));
    expect((add as HTMLButtonElement).disabled).toBe(false);
    await user.click(add);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ menuItemId: 'tea', qty: 1, modifiers: [expect.objectContaining({ id: 'l' })] }),
    );
  });

  it('stops extra choices at max_select', async () => {
    const { user } = sheet();
    await user.click(screen.getByLabelText('Ice'));
    await user.click(screen.getByLabelText('Lemon'));
    expect((screen.getByLabelText('Mint') as HTMLInputElement).disabled).toBe(true);
  });

  it('previews (price + deltas) x qty', async () => {
    const { user } = sheet();
    await user.click(screen.getByLabelText(/Large/));
    await user.click(screen.getByRole('button', { name: 'More' }));
    // (1000 + 500) x 2 = 3000
    expect(screen.getByText(/Line price/).textContent).toContain('3,000');
  });
});

describe('BasketPanel', () => {
  const basket = addLine(emptyBasket(), { menuItemId: 'tea', nameEn: 'Tea', nameAr: 'Tea', basePrice: 1000, modifiers: [], qty: 1, note: '' });
  const renderPanel = (sending: boolean, onSend = vi.fn()) =>
    render(
      <LocaleProvider>
        <BasketPanel basket={basket} sending={sending} onQty={vi.fn()} onRemove={vi.fn()} onNote={vi.fn()} onSend={onSend} />
      </LocaleProvider>,
    );

  it('sends once when idle', async () => {
    const onSend = vi.fn();
    renderPanel(false, onSend);
    await userEvent.click(screen.getByRole('button', { name: 'Send to kitchen' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables Send while sending', async () => {
    const onSend = vi.fn();
    renderPanel(true, onSend);
    const btn = screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables Send when the basket is empty', () => {
    render(
      <LocaleProvider>
        <BasketPanel basket={emptyBasket()} sending={false} onQty={vi.fn()} onRemove={vi.fn()} onNote={vi.fn()} onSend={vi.fn()} />
      </LocaleProvider>,
    );
    expect((screen.getByRole('button', { name: 'Send to kitchen' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('BasketPanel lock after an unclear send', () => {
  const basket = addLine(emptyBasket(), {
    menuItemId: 'tea',
    nameEn: 'Tea',
    nameAr: 'Tea',
    basePrice: 1000,
    modifiers: [],
    qty: 1,
    note: '',
  });
  const panel = (check: 'checking' | 'failed' | null, onRecheck = vi.fn()) => {
    render(
      <LocaleProvider>
        <BasketPanel basket={basket} sending={false} check={check} onRecheck={onRecheck} onQty={vi.fn()} onRemove={vi.fn()} onNote={vi.fn()} onSend={vi.fn()} />
      </LocaleProvider>,
    );
    return onRecheck;
  };

  it('locks edits and Send and says it is checking', () => {
    panel('checking');
    expect(screen.getByText('Checking whether the order went through…')).toBeTruthy();
    for (const name of [/More/, /Fewer/, /Remove/, /Send to kitchen/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('offers a recheck when the check itself failed', async () => {
    const onRecheck = panel('failed');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalled();
  });
});
