import { describe, expect, it } from 'vitest';
import {
  addLine,
  basketTotal,
  emptyBasket,
  ensureSendKey,
  sendLanded,
  linePrice,
  loadBasket,
  modifierErrors,
  removeLine,
  saveBasket,
  setNote,
  setQty,
  toPayload,
  toggleModifier,
  type Basket,
  type ModifierGroup,
  type NewLine,
} from './basketLogic';

const mod = (id: string, priceDelta = 0) => ({ id, nameEn: id, nameAr: id, priceDelta });
const group = (id: string, minSelect: number, maxSelect: number, ids: string[]): ModifierGroup => ({
  id,
  nameEn: id,
  nameAr: id,
  minSelect,
  maxSelect,
  modifiers: ids.map((m) => mod(m)),
});
const tea = (over: Partial<NewLine> = {}): NewLine => ({
  menuItemId: 'tea',
  nameEn: 'Tea',
  nameAr: 'tea-ar',
  basePrice: 1000,
  modifiers: [],
  qty: 1,
  note: '',
  ...over,
});

describe('linePrice', () => {
  it('is (price + modifier deltas) x qty', () => {
    expect(linePrice(1000, [mod('a', 250), mod('b', -100)], 3)).toBe(3450);
  });
});

describe('addLine', () => {
  it('merges identical lines by summing qty', () => {
    let b = addLine(emptyBasket(), tea({ qty: 1 }));
    b = addLine(b, tea({ qty: 2 }));
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0]?.qty).toBe(3);
  });
  it('ignores modifier order, but different modifiers or notes stay separate', () => {
    let b = addLine(emptyBasket(), tea({ modifiers: [mod('a'), mod('b')] }));
    b = addLine(b, tea({ modifiers: [mod('b'), mod('a')] }));
    expect(b.lines).toHaveLength(1);
    b = addLine(b, tea({ modifiers: [mod('a')] }));
    b = addLine(b, tea({ modifiers: [mod('a'), mod('b')], note: 'no sugar' }));
    expect(b.lines).toHaveLength(3);
  });
  it('caps qty at 999', () => {
    let b = addLine(emptyBasket(), tea({ qty: 600 }));
    b = addLine(b, tea({ qty: 600 }));
    expect(b.lines[0]?.qty).toBe(999);
  });
});

describe('edits', () => {
  const base = (): Basket => addLine(emptyBasket(), tea({ qty: 2 }));
  it('setQty changes qty and removes the line at zero', () => {
    const b = base();
    const id = b.lines[0]!.id;
    expect(setQty(b, id, 5).lines[0]?.qty).toBe(5);
    expect(setQty(b, id, 0).lines).toHaveLength(0);
    expect(setQty(b, id, 5000).lines[0]?.qty).toBe(999);
  });
  it('removeLine and setNote', () => {
    const b = base();
    const id = b.lines[0]!.id;
    expect(setNote(b, id, ' hot ').lines[0]?.note).toBe('hot');
    expect(removeLine(b, id).lines).toHaveLength(0);
  });
  it('basketTotal sums line previews', () => {
    const b = addLine(base(), tea({ menuItemId: 'cake', basePrice: 3000, modifiers: [mod('x', 500)] }));
    expect(basketTotal(b)).toBe(2000 + 3500);
  });
});

describe('modifier rules', () => {
  const size = group('size', 1, 1, ['s', 'm']);
  const extras = group('extras', 0, 2, ['e1', 'e2', 'e3']);
  it('requires min_select and caps max_select', () => {
    expect(modifierErrors([size, extras], [])).toEqual([{ groupId: 'size', kind: 'min' }]);
    expect(modifierErrors([size, extras], ['s'])).toEqual([]);
    expect(modifierErrors([size, extras], ['s', 'e1', 'e2', 'e3'])).toEqual([{ groupId: 'extras', kind: 'max' }]);
  });
  it('toggle replaces within a single-choice group and stops at max', () => {
    expect(toggleModifier(size, ['s'], 'm')).toEqual(['m']);
    expect(toggleModifier(extras, ['e1', 'e2'], 'e3')).toEqual(['e1', 'e2']);
    expect(toggleModifier(extras, ['e1'], 'e1')).toEqual([]);
    expect(toggleModifier(extras, ['s'], 'e1')).toEqual(['s', 'e1']);
  });
});

describe('toPayload', () => {
  it('sends ids, qty, modifier ids and note, never prices', () => {
    const b = addLine(emptyBasket(), tea({ qty: 2, modifiers: [mod('a', 100)], note: 'x' }));
    expect(toPayload(b)).toEqual([{ menu_item_id: 'tea', qty: 2, modifier_ids: ['a'], note: 'x' }]);
  });
});

describe('send key', () => {
  it('is stable until the basket changes', () => {
    let n = 0;
    const make = () => `k${++n}`;
    let b = addLine(emptyBasket(), tea());
    b = ensureSendKey(b, make);
    const first = b.sendKey;
    expect(ensureSendKey(b, make).sendKey).toBe(first);
    const edited = setQty(b, b.lines[0]!.id, 2);
    expect(edited.sendKey).toBeNull();
    expect(ensureSendKey(edited, make).sendKey).not.toBe(first);
  });
});

describe('persistence', () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it('round-trips per tab and survives junk', () => {
    const s = store();
    const b = ensureSendKey(addLine(emptyBasket(), tea()), () => 'k1');
    saveBasket(s, 'tab1', b);
    expect(loadBasket(s, 'tab1')).toEqual(b);
    expect(loadBasket(s, 'tab2').lines).toEqual([]);
    s.setItem('rop.basket.bad', '{nope');
    expect(loadBasket(s, 'bad').lines).toEqual([]);
  });
  it('removes the entry when the basket is empty', () => {
    const s = store();
    saveBasket(s, 't', addLine(emptyBasket(), tea()));
    saveBasket(s, 't', emptyBasket());
    expect(s.getItem('rop.basket.t')).toBeNull();
  });
});

describe('unclear sends', () => {
  it('sendLanded sees a new order only', () => {
    const before = new Set(['o1']);
    expect(sendLanded(before, [{ order_id: 'o1' }])).toBe(false);
    expect(sendLanded(before, [{ order_id: 'o1' }, { order_id: 'o2' }])).toBe(true);
  });
});
