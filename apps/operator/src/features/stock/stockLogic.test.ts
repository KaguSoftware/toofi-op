import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countedTotal,
  debounce,
  deliveryPayload,
  emptySheet,
  formatQty,
  markSaved,
  parseQty,
  pendingLines,
  recipeCost,
  recipePreview,
  setCounted,
  sheetFromSaved,
  validateRecipe,
} from './stockLogic';

describe('quantities', () => {
  it('formats up to 3 decimals with the unit after', () => {
    expect(formatQty(1250.5, 'g', 'en')).toBe('1,250.5 g');
    expect(formatQty(0.1234, 'ml', 'en')).toBe('0.123 ml');
    expect(formatQty(3, 'pc', 'en')).toBe('3 pc');
  });
  it('parses decimals up to 3 places only', () => {
    expect(parseQty('2.5')).toBe(2.5);
    expect(parseQty('0')).toBe(0);
    expect(parseQty('1.2345')).toBeNull();
    expect(parseQty('-1')).toBeNull();
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('')).toBeNull();
  });
});

describe('recipe cost preview', () => {
  const costs = new Map([
    ['beans', 40],
    ['milk', 2.5],
  ]);
  it('sums qty x cost, rounded to IQD', () => {
    expect(recipeCost([{ ingredientId: 'beans', qty: 18 }, { ingredientId: 'milk', qty: 150 }], costs)).toBe(1095);
    expect(recipeCost([{ ingredientId: 'milk', qty: 1.1 }], costs)).toBe(3);
  });
  it('treats an unknown ingredient as free and an empty recipe as 0', () => {
    expect(recipeCost([{ ingredientId: 'x', qty: 5 }], costs)).toBe(0);
    expect(recipeCost([], costs)).toBe(0);
  });
  it('gives margin and margin percent', () => {
    expect(recipePreview(2000, [{ ingredientId: 'beans', qty: 25 }], costs)).toEqual({ cost: 1000, margin: 1000, marginPct: 50 });
  });
  it('has no percent for a free item and a negative margin when cost exceeds price', () => {
    expect(recipePreview(0, [], costs).marginPct).toBeNull();
    expect(recipePreview(500, [{ ingredientId: 'beans', qty: 25 }], costs).margin).toBe(-500);
  });
  it('validates lines', () => {
    expect(validateRecipe([{ ingredientId: 'a', qty: 0 }])).toBe('qty');
    expect(validateRecipe([{ ingredientId: 'a', qty: 1 }, { ingredientId: 'a', qty: 2 }])).toBe('duplicate');
    expect(validateRecipe([{ ingredientId: 'a', qty: 1 }])).toBeNull();
  });
});

describe('deliveryPayload', () => {
  it('converts complete lines', () => {
    expect(deliveryPayload([{ ingredientId: 'a', qty: '2.5', unitCost: '10' }])).toEqual([
      { ingredient_id: 'a', qty: 2.5, unit_cost: 10 },
    ]);
  });
  it('is null while empty or any line is bad', () => {
    expect(deliveryPayload([])).toBeNull();
    expect(deliveryPayload([{ ingredientId: 'a', qty: '0', unitCost: '10' }])).toBeNull();
    expect(deliveryPayload([{ ingredientId: '', qty: '1', unitCost: '10' }])).toBeNull();
    expect(deliveryPayload([{ ingredientId: 'a', qty: '1', unitCost: '' }])).toBeNull();
  });
});

describe('count sheet', () => {
  it('starts clean and tracks edits as dirty', () => {
    let s = emptySheet();
    expect(pendingLines(s)).toEqual([]);
    s = setCounted(s, 'a', '12.5');
    s = setCounted(s, 'b', '');
    expect(pendingLines(s)).toEqual([
      { ingredient_id: 'a', counted: 12.5 },
      { ingredient_id: 'b', counted: null },
    ]);
  });
  it('skips invalid text instead of sending it', () => {
    expect(pendingLines(setCounted(emptySheet(), 'a', '1.2.3'))).toEqual([]);
  });
  it('markSaved cleans only what was sent unchanged', () => {
    let s = setCounted(setCounted(emptySheet(), 'a', '1'), 'b', '2');
    const sent = pendingLines(s);
    const sentValues = { ...s.values };
    s = setCounted(s, 'b', '3'); // edited while saving
    s = markSaved(s, sent, sentValues);
    expect([...s.dirty]).toEqual(['b']);
  });
  it('restores saved counts and counts progress', () => {
    const s = sheetFromSaved([
      { ingredient_id: 'a', counted: 4 },
      { ingredient_id: 'b', counted: null },
    ]);
    expect(s.values).toEqual({ a: '4' });
    expect(s.dirty.size).toBe(0);
    expect(countedTotal(s)).toBe(1);
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('runs once after the last call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d();
    vi.advanceTimersByTime(500);
    d();
    vi.advanceTimersByTime(700);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('flush runs a waiting call now and cancel drops it', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    d();
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
