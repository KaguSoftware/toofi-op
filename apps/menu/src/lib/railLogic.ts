/** The category rail follows the menu's scroll: which section is "current". */

/** A section counts as current a little before its top edge reaches the top of the list. */
export const RAIL_LEAD = 24;

/**
 * `tops` are each section's offset from the top of the scrolling list. At the very bottom the
 * last section wins, even when it is too short to ever reach the top.
 */
export function activeSectionIndex(tops: readonly number[], scrollTop: number, atEnd: boolean): number {
  if (tops.length === 0) return -1;
  if (atEnd) return tops.length - 1;
  let current = 0;
  tops.forEach((top, i) => {
    if (top <= scrollTop + RAIL_LEAD) current = i;
  });
  return current;
}
