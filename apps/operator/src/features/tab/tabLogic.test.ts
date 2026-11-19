import { describe, expect, it } from 'vitest';
import { groupSentLines, hasActiveLines, menuItemGroups, type SentLine } from './tabLogic';

const line = (over: Partial<SentLine>): SentLine => ({
  id: 'l',
  order_id: 'o1',
  name_en: 'Tea',
  name_ar: 'tea',
  unit_price: 1000,
  qty: 1,
  line_total: 1000,
  note: null,
  voided_at: null,
  void_reason: null,
  created_at: '2026-11-20T10:00:00Z',
  placed_at: '2026-11-20T10:00:00Z',
  placed_by_name: 'Sara',
  modifiers: [],
  ...over,
});

describe('groupSentLines', () => {
  it('groups by order, oldest order first, keeping voided lines', () => {
    const groups = groupSentLines([
      line({ id: '3', order_id: 'o2', placed_at: '2026-11-20T11:00:00Z' }),
      line({ id: '1', order_id: 'o1' }),
      line({ id: '2', order_id: 'o1', voided_at: '2026-11-20T10:30:00Z', void_reason: 'spilled' }),
    ]);
    expect(groups.map((g) => g.orderId)).toEqual(['o1', 'o2']);
    expect(groups[0]?.lines.map((l) => l.id)).toEqual(['1', '2']);
    expect(groups[0]?.placedByName).toBe('Sara');
  });
});

describe('hasActiveLines', () => {
  it('ignores voided lines', () => {
    expect(hasActiveLines([line({ voided_at: 'x' })])).toBe(false);
    expect(hasActiveLines([line({ voided_at: 'x' }), line({ id: '2' })])).toBe(true);
    expect(hasActiveLines([])).toBe(false);
  });
});

describe('menuItemGroups', () => {
  it('flattens the join, drops inactive modifiers and keeps modifier order stable', () => {
    const groups = menuItemGroups([
      {
        modifier_groups: {
          id: 'g',
          name_en: 'Size',
          name_ar: 's',
          min_select: 1,
          max_select: 1,
          modifiers: [
            { id: 'b', name_en: 'B', name_ar: 'b', price_delta: 0, is_active: true },
            { id: 'x', name_en: 'X', name_ar: 'x', price_delta: 5, is_active: false },
          ],
        },
      },
    ]);
    expect(groups).toEqual([
      {
        id: 'g',
        nameEn: 'Size',
        nameAr: 's',
        minSelect: 1,
        maxSelect: 1,
        modifiers: [{ id: 'b', nameEn: 'B', nameAr: 'b', priceDelta: 0 }],
      },
    ]);
  });
});
