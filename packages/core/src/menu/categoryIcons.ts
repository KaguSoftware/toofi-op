/**
 * The icon keys a menu category can carry, matching the check on
 * `menu_categories.icon` (default `dish`). The staff app's icon picker and the
 * guest site both draw from this list.
 */
export const CATEGORY_ICONS = [
  'dish',
  'mezze',
  'grill',
  'main',
  'sandwich',
  'dessert',
  'hot_drink',
  'cold_drink',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
