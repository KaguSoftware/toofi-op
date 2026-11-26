import { describe, expect, it } from 'vitest';
import { CATEGORY_ICONS } from './categoryIcons';

describe('CATEGORY_ICONS', () => {
  it('is exactly the keys the menu_categories.icon check accepts, default first', () => {
    expect(CATEGORY_ICONS).toEqual([
      'dish',
      'mezze',
      'grill',
      'main',
      'sandwich',
      'dessert',
      'hot_drink',
      'cold_drink',
    ]);
  });
});
