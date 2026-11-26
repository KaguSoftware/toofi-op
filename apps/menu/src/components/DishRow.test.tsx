import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestCopy } from '@/lib/copyLogic';
import { DishRow } from './DishRow';

afterEach(cleanup);
const copy = guestCopy('en');
const row = (props: Partial<Parameters<typeof DishRow>[0]> = {}) =>
  render(
    <ul>
      <DishRow copy={copy} id="hummus" name="Hummus" price="4,000" photoUrl={null} icon="mezze" {...props} />
    </ul>,
  );

describe('DishRow', () => {
  it('not in the order: the name, the price and one plus button', () => {
    row();
    expect(screen.getByText('Hummus')).toBeTruthy();
    expect(screen.getByText('4,000')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add one Hummus' })).toBeTruthy();
  });
  it('in the order: minus, the count, and a filled plus', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    row({ qty: 2, onAdd, onRemove });
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove one Hummus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one Hummus' }));
    expect(onRemove).toHaveBeenCalledWith('hummus');
    expect(onAdd).toHaveBeenCalledWith('hummus');
    expect(screen.getByRole('button', { name: 'Add one Hummus' }).className).toContain('round--filled');
  });
  it('a dish with options says so on its plus, which opens the options sheet', () => {
    row({ hasOptions: true });
    const plus = screen.getByRole('button', { name: 'Choose options for Hummus' });
    expect(plus.getAttribute('aria-haspopup')).toBe('dialog');
  });
  it('with ordering switched off, the row is a menu entry with no controls', () => {
    row({ readOnly: true, qty: 2 });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Hummus')).toBeTruthy();
  });
  it('keeps the same ornament whether or not the dish is in the order', () => {
    const { container, rerender } = row();
    expect(container.querySelectorAll('.row__orn svg')).toHaveLength(1);
    rerender(
      <ul>
        <DishRow copy={copy} id="hummus" name="Hummus" price="4,000" photoUrl={null} icon="mezze" qty={3} />
      </ul>,
    );
    expect(container.querySelectorAll('.row__orn svg')).toHaveLength(1);
  });
});
