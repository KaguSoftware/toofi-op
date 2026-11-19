import { describe, expect, it } from 'vitest';
import { bpsToPercent, moveId, parseIntStrict, validateGroup, validateItem, validateTable, validateTaxGroup } from './menuLogic';

const item = { nameEn: 'Tea', nameAr: 'شاي', price: 1500, categoryId: 'c', taxGroupId: 't', sort: 0 };

describe('validateItem', () => {
  it('accepts a complete item', () => expect(validateItem(item)).toEqual({}));
  it('flags every missing field', () => {
    const e = validateItem({ ...item, nameEn: ' ', nameAr: '', categoryId: '', taxGroupId: '', price: -1 });
    expect(Object.keys(e).sort()).toEqual(['categoryId', 'nameAr', 'nameEn', 'price', 'taxGroupId']);
  });
  it('rejects fractional price', () => expect(validateItem({ ...item, price: 10.5 }).price).toBeDefined());
  it('allows a price of 0', () => expect(validateItem({ ...item, price: 0 }).price).toBeUndefined());
});

describe('validateGroup (min/max)', () => {
  const g = { nameEn: 'Size', nameAr: 'الحجم', minSelect: 0, maxSelect: 1 };
  it('accepts optional and required groups', () => {
    expect(validateGroup(g)).toEqual({});
    expect(validateGroup({ ...g, minSelect: 2, maxSelect: 3 })).toEqual({});
  });
  it('rejects max below min', () => {
    expect(validateGroup({ ...g, minSelect: 3, maxSelect: 2 }).maxSelect).toBe('manage.err.maxBelowMin');
  });
  it('rejects negative min and max under 1', () => {
    expect(validateGroup({ ...g, minSelect: -1 }).minSelect).toBeDefined();
    expect(validateGroup({ ...g, maxSelect: 0 }).maxSelect).toBe('manage.err.maxInvalid');
  });
  it('rejects NaN', () => {
    expect(validateGroup({ ...g, minSelect: NaN }).minSelect).toBeDefined();
  });
});

describe('validateTaxGroup / validateTable', () => {
  it('bounds the rate to 0..10000 bps', () => {
    expect(validateTaxGroup('VAT', 1500)).toEqual({});
    expect(validateTaxGroup('VAT', 10001).rate).toBeDefined();
    expect(validateTaxGroup(' ', 0).name).toBeDefined();
  });
  it('needs a label, an area and positive seats', () => {
    expect(validateTable({ label: 'T1', areaId: 'a', seats: 4, gridX: 0, gridY: 0 })).toEqual({});
    const e = validateTable({ label: '', areaId: '', seats: 0, gridX: -1, gridY: 0 });
    expect(Object.keys(e).sort()).toEqual(['areaId', 'gridX', 'label', 'seats']);
  });
});

describe('moveId', () => {
  it('swaps with the neighbour', () => {
    expect(moveId(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('does nothing at the ends', () => {
    expect(moveId(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('number helpers', () => {
  it('parseIntStrict', () => {
    expect(parseIntStrict('12')).toBe(12);
    expect(parseIntStrict('1.5')).toBeNaN();
    expect(parseIntStrict('')).toBeNaN();
  });
  it('bpsToPercent', () => {
    expect(bpsToPercent(1500)).toBe('15');
    expect(bpsToPercent(750)).toBe('7.5');
  });
});
