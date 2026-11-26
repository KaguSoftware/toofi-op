/** Path data for the guest site's icons: a 24 grid, drawn as 1.75 strokes in currentColor. */

export const ICONS = {
  bell: ['M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7Z', 'M10 20a2 2 0 0 0 4 0'],
  plus: ['M12 6v12M6 12h12'],
  minus: ['M6 12h12'],
  close: ['M6 6l12 12M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  order: ['M5 4h10l4 4v12H5V4Z', 'M9 12h6M9 16h4'],
  bill: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3Z', 'M9 8h6M9 12h6'],
  water: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z'],
  help: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7', 'M12 17h.01'],
  offline: ['M4 4l16 16', 'M2.5 9a15 15 0 0 1 5-3', 'M13.5 5.2A15 15 0 0 1 21.5 9', 'M8 12.8a8 8 0 0 1 3-1.7', 'M16.5 12.4a8 8 0 0 0-1.5-.9', 'M12 19h.01'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

/** One drawing per category icon key (@rop/core CATEGORY_ICONS, ticket 02). Unknown keys draw `dish`. */
export const CATEGORY_ICON_PATHS: Readonly<Record<string, readonly string[]>> = {
  dish: ['M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16Z', 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z'],
  mezze: ['M3 11h18c0 5-4 8.5-9 8.5S3 16 3 11Z', 'M8 21.5h8', 'M9 4.5c-.8 1 .8 2 0 3', 'M13 4.5c-.8 1 .8 2 0 3'],
  grill: ['M12 3c.6 2.6 5 4.6 5 9.8a5 5 0 0 1-10 0c0-2 .9-3.5 2-4.6.2 1.5.9 2.5 1.8 3C10.8 8.6 10.4 6 12 3Z'],
  main: ['M3 18h18', 'M5 18a7 7 0 0 1 14 0', 'M12 11V9', 'M10.5 9h3'],
  sandwich: ['M4 10c0-3 3.5-5 8-5s8 2 8 5', 'M3 13h18', 'M4 16h16', 'M5 16v1.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V16'],
  dessert: ['M7 12h10l-1.5 8h-7L7 12Z', 'M6 12a6 6 0 0 1 12 0', 'M12 4v2'],
  hot_drink: ['M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-4Z', 'M16 11h1.2a2.4 2.4 0 0 1 0 4.8H16', 'M8 4v3', 'M12 4v3', 'M4 21.5h13'],
  cold_drink: ['M7 8h10l-1.2 11.2a1 1 0 0 1-1 .8H9.2a1 1 0 0 1-1-.8L7 8Z', 'M6.5 8h11', 'M13 8l2-5h2', 'M8.5 13h7'],
};

export function categoryIconPaths(key: string): readonly string[] {
  return CATEGORY_ICON_PATHS[key] ?? CATEGORY_ICON_PATHS.dish!;
}
