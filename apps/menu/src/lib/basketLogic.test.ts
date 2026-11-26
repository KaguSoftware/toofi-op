import { describe, expect, it } from 'vitest';
import { pluralForm } from '@rop/i18n';
import {
  MAX_LINES,
  MAX_QTY,
  NOTE_MAX,
  addToBasket,
  capCode,
  changeLine,
  cleanNote,
  clipNote,
  indexMenu,
  itemCountForm,
  lineId,
  noteCounter,
  qtyByItem,
  removeLine,
  removeOneOf,
  resolveLines,
  selectionState,
  toRequest,
  toggleOption,
  totalsOf,
  unitPriceOf,
  type BasketLine,
} from './basketLogic';
import type { GroupView, MenuView } from './menuViewLogic';

const side: GroupView = {
  id: 'g-side',
  name: 'Side',
  min: 1,
  max: 1,
  options: [
    { id: 'rice', name: 'Rice', delta: 0, deltaText: '' },
    { id: 'fries', name: 'Fries', delta: 1500, deltaText: '+1,500' },
  ],
};
const extras: GroupView = {
  id: 'g-extra',
  name: 'Extras',
  min: 0,
  max: 2,
  options: [
    { id: 'egg', name: 'Egg', delta: 1000, deltaText: '+1,000' },
    { id: 'cheese', name: 'Cheese', delta: 500, deltaText: '+500' },
    { id: 'pickle', name: 'Pickle', delta: 0, deltaText: '' },
  ],
};

const MENU: MenuView = {
  venueName: 'Kagu',
  sections: [
    {
      id: 'c1',
      name: 'Mezze',
      icon: 'mezze',
      items: [
        { id: 'hummus', name: 'Hummus', price: '4,000', unitPrice: 4000, photoUrl: 'https://x/h.webp', groups: [] },
        { id: 'kebab', name: 'Kebab', price: '15,000', unitPrice: 15000, photoUrl: null, groups: [side, extras] },
      ],
    },
  ],
};
const index = indexMenu(MENU);
const line = (itemId: string, qty = 1, modifierIds: string[] = []): BasketLine => ({ itemId, qty, modifierIds });

describe('lineId', () => {
  it('is the same for the same dish and options in any order', () => {
    expect(lineId('kebab', ['fries', 'egg'])).toBe(lineId('kebab', ['egg', 'fries']));
    expect(lineId('kebab', ['rice'])).not.toBe(lineId('kebab', ['fries']));
    expect(lineId('kebab', [])).not.toBe(lineId('hummus', []));
  });
});

describe('addToBasket', () => {
  it('adds a new dish as a line of one', () => {
    expect(addToBasket([], 'hummus', [])).toEqual({ outcome: 'added', lines: [line('hummus')] });
  });
  it('merges an equal line instead of adding a second one', () => {
    const first = addToBasket([], 'kebab', ['fries', 'egg']).lines;
    const second = addToBasket(first, 'kebab', ['egg', 'fries'], 2);
    expect(second.lines).toEqual([line('kebab', 3, ['egg', 'fries'])]);
  });
  it('keeps the same dish with different options as separate lines', () => {
    const lines = addToBasket(addToBasket([], 'kebab', ['rice']).lines, 'kebab', ['fries']).lines;
    expect(lines).toHaveLength(2);
  });
  it('stores the options sorted so equal lines compare equal', () => {
    expect(addToBasket([], 'kebab', ['fries', 'egg']).lines[0]?.modifierIds).toEqual(['egg', 'fries']);
  });
  it(`stops at ${MAX_QTY} of one line and changes nothing`, () => {
    const full = [line('hummus', MAX_QTY)];
    expect(addToBasket(full, 'hummus', [])).toEqual({ outcome: 'max-qty', lines: full });
    expect(addToBasket([line('hummus', 19)], 'hummus', [], 2).outcome).toBe('max-qty');
    expect(addToBasket([line('hummus', 19)], 'hummus', []).lines[0]?.qty).toBe(20);
  });
  it(`stops at ${MAX_LINES} different lines`, () => {
    const many = Array.from({ length: MAX_LINES }, (_, i) => line(`dish-${i}`));
    expect(addToBasket(many, 'hummus', [])).toEqual({ outcome: 'max-lines', lines: many });
    // A line that merges is not a new line.
    expect(addToBasket(many, 'dish-3', []).outcome).toBe('added');
  });
  it('remembers the dish\'s name for a line that outlives it, and keeps the first name when lines merge', () => {
    const first = addToBasket([], 'hummus', [], 1, 'Hummus').lines;
    expect(first[0]).toEqual({ itemId: 'hummus', modifierIds: [], qty: 1, name: 'Hummus' });
    expect(addToBasket(first, 'hummus', [], 1, 'حمص').lines[0]).toMatchObject({ qty: 2, name: 'Hummus' });
    expect(resolveLines(first, index)[0]?.name).toBe('Hummus');
    expect(resolveLines([{ itemId: 'gone', modifierIds: [], qty: 1, name: 'Old dish' }], index)[0]).toMatchObject({ name: 'Old dish', problem: 'unavailable' });
  });
  it('does not change the list it was given', () => {
    const before = [line('hummus', 2)];
    addToBasket(before, 'hummus', []);
    expect(before).toEqual([line('hummus', 2)]);
  });
});

describe('changeLine, removeLine, removeOneOf', () => {
  const lines = [line('hummus', 2), line('kebab', 1, ['rice']), line('kebab', 3, ['fries'])];
  it('moves one line up or down, and drops it at zero', () => {
    expect(changeLine(lines, lineId('hummus', []), 1).lines[0]?.qty).toBe(3);
    expect(changeLine(lines, lineId('hummus', []), -1).lines[0]?.qty).toBe(1);
    expect(changeLine([line('hummus')], lineId('hummus', []), -1).lines).toEqual([]);
  });
  it('refuses a plus past the cap, and says so', () => {
    expect(changeLine([line('hummus', MAX_QTY)], lineId('hummus', []), 1).outcome).toBe('max-qty');
  });
  it('ignores an unknown line', () => {
    expect(changeLine(lines, 'nope', 1)).toEqual({ outcome: 'added', lines });
  });
  it('removes a whole line', () => {
    expect(removeLine(lines, lineId('kebab', ['rice']))).toEqual([lines[0], lines[2]]);
  });
  it('the minus on a dish row takes one off the dish\'s most recently added line', () => {
    expect(removeOneOf(lines, 'kebab')).toEqual([lines[0], lines[1], line('kebab', 2, ['fries'])]);
    expect(removeOneOf([line('kebab', 1, ['rice']), line('hummus')], 'kebab')).toEqual([line('hummus')]);
    expect(removeOneOf(lines, 'unknown')).toEqual(lines);
  });
  it('counts a dish across its lines for the row', () => {
    expect(qtyByItem(lines)).toEqual({ hummus: 2, kebab: 4 });
  });
});

describe('option groups', () => {
  it('counts the choices in a group against its minimum and maximum', () => {
    expect(selectionState(side, [])).toEqual({ count: 0, ok: false, full: false });
    expect(selectionState(side, ['rice'])).toEqual({ count: 1, ok: true, full: true });
    expect(selectionState(extras, [])).toEqual({ count: 0, ok: true, full: false });
    expect(selectionState(extras, ['egg', 'cheese'])).toEqual({ count: 2, ok: true, full: true });
  });
  it('a one-of group swaps the choice; a many-of group toggles up to its maximum', () => {
    expect(toggleOption(side, [], 'rice')).toEqual(['rice']);
    expect(toggleOption(side, ['rice'], 'fries')).toEqual(['fries']);
    expect(toggleOption(side, ['rice'], 'rice')).toEqual(['rice']);
    expect(toggleOption(extras, [], 'egg')).toEqual(['egg']);
    expect(toggleOption(extras, ['egg'], 'cheese')).toEqual(['egg', 'cheese']);
    expect(toggleOption(extras, ['egg', 'cheese'], 'pickle')).toEqual(['egg', 'cheese']);
    expect(toggleOption(extras, ['egg', 'cheese'], 'egg')).toEqual(['cheese']);
  });
  it('an optional one-of group can be cleared by tapping the choice again', () => {
    const optional: GroupView = { ...side, min: 0 };
    expect(toggleOption(optional, ['rice'], 'rice')).toEqual([]);
  });
  it('ignores an option that is not in the group', () => {
    expect(toggleOption(side, ['rice'], 'egg')).toEqual(['rice']);
  });
});

describe('unitPriceOf', () => {
  it('is the dish price plus the chosen options\' changes', () => {
    const kebab = index.get('kebab')!.dish;
    expect(unitPriceOf(kebab, [])).toBe(15000);
    expect(unitPriceOf(kebab, ['fries', 'egg'])).toBe(17500);
    expect(unitPriceOf(kebab, ['nope'])).toBe(15000);
  });
});

describe('resolveLines and totalsOf', () => {
  it('prices a line as dish plus option changes, times the count, as a mirror', () => {
    const [hummus, kebab] = resolveLines([line('hummus', 2), line('kebab', 2, ['egg', 'fries'])], index);
    expect(hummus).toMatchObject({ name: 'Hummus', unitPrice: 4000, lineTotal: 8000, problem: null, photoUrl: 'https://x/h.webp', icon: 'mezze', optionNames: [] });
    expect(kebab).toMatchObject({ name: 'Kebab', unitPrice: 15000 + 1000 + 1500, lineTotal: 2 * 17500, problem: null });
    expect(kebab?.optionNames).toEqual(['Fries', 'Egg']); // menu order: the Side group, then Extras
  });
  it('marks a dish that is no longer on the menu', () => {
    expect(resolveLines([line('gone', 1)], index)[0]).toMatchObject({ problem: 'unavailable', lineTotal: 0 });
  });
  it('marks a line whose option is gone, or whose choices no longer fit the groups', () => {
    expect(resolveLines([line('kebab', 1, ['rice', 'old'])], index)[0]?.problem).toBe('options');
    // Side is required: a kebab with no side is not valid any more.
    expect(resolveLines([line('kebab', 1, [])], index)[0]?.problem).toBe('options');
    expect(resolveLines([line('kebab', 1, ['rice', 'fries'])], index)[0]?.problem).toBe('options');
    // A dish that gained a group since it was added.
    expect(resolveLines([line('hummus', 1, ['rice'])], index)[0]?.problem).toBe('options');
  });
  it('totals only the lines that can be sent', () => {
    const views = resolveLines([line('hummus', 2), line('gone', 5), line('kebab', 1, ['rice'])], index);
    expect(totalsOf(views)).toEqual({ count: 3, total: 8000 + 15000, canSend: false, empty: false });
    expect(totalsOf(resolveLines([line('hummus', 2)], index))).toEqual({ count: 2, total: 8000, canSend: true, empty: false });
    expect(totalsOf([])).toEqual({ count: 0, total: 0, canSend: false, empty: true });
  });
});

describe('toRequest: what goes to the server', () => {
  it('is ids, quantities, option ids and the note, and never a price', () => {
    const request = toRequest([line('hummus', 2), line('kebab', 1, ['fries', 'egg'])], 'no onions');
    expect(request).toEqual([
      { menu_item_id: 'hummus', qty: 2, modifier_ids: [], note: 'no onions' },
      { menu_item_id: 'kebab', qty: 1, modifier_ids: ['egg', 'fries'], note: null },
    ]);
    expect(JSON.stringify(request)).not.toMatch(/price|total|delta|amount/i);
  });
  it('sends no note when it is blank', () => {
    expect(toRequest([line('hummus')], '   \n ')[0]?.note).toBeNull();
  });
});

describe('notes', () => {
  it('clips typing at 140 characters, counting a character once even when it is an emoji', () => {
    expect(clipNote('a'.repeat(200))).toHaveLength(NOTE_MAX);
    expect(Array.from(clipNote('😀'.repeat(150)))).toHaveLength(NOTE_MAX);
    expect(clipNote('short ')).toBe('short ');
  });
  it('cleans a note for sending: collapsed whitespace, trimmed, clipped, null when empty', () => {
    expect(cleanNote('  no   onions\n please ')).toBe('no onions please');
    expect(cleanNote('')).toBeNull();
    expect(cleanNote('x'.repeat(300))).toHaveLength(NOTE_MAX);
  });
  it('shows the counter only near the limit', () => {
    expect(noteCounter('a'.repeat(99))).toEqual({ show: false, used: 99, remaining: 41 });
    expect(noteCounter('a'.repeat(100))).toEqual({ show: true, used: 100, remaining: 40 });
    expect(noteCounter('a'.repeat(140))).toEqual({ show: true, used: 140, remaining: 0 });
  });
});

describe('itemCountForm', () => {
  it('picks the same plural form as @rop/i18n for every count a basket can reach, in both languages', () => {
    for (const locale of ['en', 'ar'] as const) {
      for (let n = 0; n <= MAX_LINES * MAX_QTY; n++) expect(itemCountForm(n, locale), `${locale} ${n}`).toBe(n === 0 ? 'zero' : pluralForm(n, locale));
    }
  });
});

describe('capCode', () => {
  it('names the database code whose guest wording explains a refused change', () => {
    expect(capCode('max-qty')).toBe('INVALID_QTY');
    expect(capCode('max-lines')).toBe('TOO_MANY_ITEMS');
    expect(capCode('added')).toBeNull();
  });
});
