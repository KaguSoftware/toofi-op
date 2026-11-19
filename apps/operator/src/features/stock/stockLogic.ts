// Pure logic for stock screens: quantity formatting, recipe cost preview, the blind
// count sheet and its autosave debounce.
import { formatNumber, type Locale } from '@rop/i18n';

export type Unit = 'g' | 'ml' | 'pc';
export const UNITS: readonly Unit[] = ['g', 'ml', 'pc'];

/** '1,250.5 g': up to 3 decimals, unit after the number. */
export function formatQty(qty: number, unit: Unit, locale: Locale): string {
  return `${formatNumber(qty, locale)} ${unit}`;
}

/** Parse a typed non-negative decimal (up to 3 places); null when not a valid number. */
export function parseQty(text: string): number | null {
  const s = text.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------- recipes

export interface RecipeLine {
  ingredientId: string;
  qty: number;
}

/** Cost of a recipe at current ingredient costs, rounded to whole IQD like v_item_cost. */
export function recipeCost(lines: readonly RecipeLine[], costPerUnit: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const l of lines) total += l.qty * (costPerUnit.get(l.ingredientId) ?? 0);
  return Math.round(total);
}

export function recipePreview(
  price: number,
  lines: readonly RecipeLine[],
  costPerUnit: ReadonlyMap<string, number>,
): { cost: number; margin: number; marginPct: number | null } {
  const cost = recipeCost(lines, costPerUnit);
  const margin = price - cost;
  return { cost, margin, marginPct: price > 0 ? Math.round((margin / price) * 1000) / 10 : null };
}

/** Lines the server would accept: positive qty, one line per ingredient. */
export function validateRecipe(lines: readonly RecipeLine[]): 'qty' | 'duplicate' | null {
  if (lines.some((l) => !(l.qty > 0))) return 'qty';
  const ids = new Set(lines.map((l) => l.ingredientId));
  return ids.size === lines.length ? null : 'duplicate';
}

// ---------------------------------------------------------------- delivery

export interface DeliveryLineDraft {
  ingredientId: string;
  qty: string;
  unitCost: string;
}

/** Server lines, or null while any line is incomplete or invalid. */
export function deliveryPayload(
  drafts: readonly DeliveryLineDraft[],
): { ingredient_id: string; qty: number; unit_cost: number }[] | null {
  if (drafts.length === 0) return null;
  const out: { ingredient_id: string; qty: number; unit_cost: number }[] = [];
  for (const d of drafts) {
    const qty = parseQty(d.qty);
    const cost = parseQty(d.unitCost);
    if (!d.ingredientId || qty === null || qty <= 0 || cost === null) return null;
    out.push({ ingredient_id: d.ingredientId, qty, unit_cost: cost });
  }
  return out;
}

// ---------------------------------------------------------------- blind count
// The sheet holds only what the user typed. It never carries expected or on-hand.

export interface CountSheet {
  /** Typed text per ingredient id; '' means not counted. */
  values: Readonly<Record<string, string>>;
  /** Ids edited since the last successful save. */
  dirty: ReadonlySet<string>;
}

export const emptySheet = (): CountSheet => ({ values: {}, dirty: new Set() });

/** Sheet pre-filled from lines the server already saved (counted values only). */
export function sheetFromSaved(saved: readonly { ingredient_id: string; counted: number | null }[]): CountSheet {
  const values: Record<string, string> = {};
  for (const s of saved) if (s.counted !== null) values[s.ingredient_id] = String(s.counted);
  return { values, dirty: new Set() };
}

export function setCounted(sheet: CountSheet, id: string, text: string): CountSheet {
  return { values: { ...sheet.values, [id]: text }, dirty: new Set(sheet.dirty).add(id) };
}

export function countError(text: string): boolean {
  return text.trim() !== '' && parseQty(text) === null;
}

/** Lines to send: dirty ids with a valid number, or null (cleared) for an emptied box. */
export function pendingLines(sheet: CountSheet): { ingredient_id: string; counted: number | null }[] {
  const out: { ingredient_id: string; counted: number | null }[] = [];
  for (const id of sheet.dirty) {
    const text = sheet.values[id] ?? '';
    if (text.trim() === '') out.push({ ingredient_id: id, counted: null });
    else {
      const n = parseQty(text);
      if (n !== null) out.push({ ingredient_id: id, counted: n });
    }
  }
  return out;
}

/** Mark the saved ids clean; an id edited again while the save ran stays dirty. */
export function markSaved(
  sheet: CountSheet,
  sent: readonly { ingredient_id: string }[],
  sentValues: Readonly<Record<string, string>>,
): CountSheet {
  const dirty = new Set(sheet.dirty);
  for (const s of sent) if (sheet.values[s.ingredient_id] === sentValues[s.ingredient_id]) dirty.delete(s.ingredient_id);
  return { values: sheet.values, dirty };
}

export const countedTotal = (sheet: CountSheet): number =>
  Object.values(sheet.values).filter((v) => parseQty(v) !== null).length;

// ---------------------------------------------------------------- debounce

export interface Debounced {
  (): void;
  /** Run now if a call is waiting. */
  flush: () => void;
  cancel: () => void;
}

/** Trailing debounce: `fn` runs `ms` after the last call. */
export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = (() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }) as Debounced;
  run.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  run.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    fn();
  };
  return run;
}
