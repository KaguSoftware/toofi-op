/**
 * The guest's order before it is sent, as pure functions. The basket is a list of lines:
 * one dish, the option ids chosen for it, a count. Everything priced here is a MIRROR of the
 * menu the phone loaded, for display; the server prices the real order (spec.md), and what
 * goes to it (`toRequest`) carries ids, counts and a note, never a price.
 *
 * The caps are the server's: 20 of one line (`INVALID_QTY`), 40 lines (`TOO_MANY_ITEMS`).
 */
import type { Locale } from '@rop/i18n';
import type { DishView, GroupView, MenuView } from './menuViewLogic';
import type { OrderLineRequest } from './requestLogic';

export const MAX_QTY = 20;
export const MAX_LINES = 40;
export const NOTE_MAX = 140;
/** The note's character counter appears from here on. */
export const NOTE_COUNTER_FROM = 100;

export interface BasketLine {
  itemId: string;
  /** Sorted, so two lines with the same choices are equal whatever order they were tapped in. */
  modifierIds: string[];
  qty: number;
  /**
   * The dish's name when it was added, in the language it was added in. Only read when the dish has
   * since left the menu, so the guest can still see which line to remove. Never sent.
   */
  name?: string;
}

/** What a change did: `added` is also the outcome of a minus or a removal. */
export type ChangeOutcome = 'added' | 'max-qty' | 'max-lines';
export interface BasketChange {
  lines: BasketLine[];
  outcome: ChangeOutcome;
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

/** The database code whose guest wording explains a refused change ('added' is not a refusal). */
export function capCode(outcome: ChangeOutcome): 'INVALID_QTY' | 'TOO_MANY_ITEMS' | null {
  return outcome === 'max-qty' ? 'INVALID_QTY' : outcome === 'max-lines' ? 'TOO_MANY_ITEMS' : null;
}

/** One line's identity: the dish and its sorted options. Equal lines share it and merge. */
export function lineId(itemId: string, modifierIds: readonly string[]): string {
  return [itemId, ...sorted(modifierIds)].join('+');
}
const idOf = (l: BasketLine): string => lineId(l.itemId, l.modifierIds);

/** Adds `qty` of a dish with these options; an equal line grows instead of a second line appearing. */
export function addToBasket(lines: readonly BasketLine[], itemId: string, modifierIds: readonly string[], qty = 1, name = ''): BasketChange {
  const id = lineId(itemId, modifierIds);
  const at = lines.findIndex((l) => idOf(l) === id);
  if (at === -1) {
    if (lines.length >= MAX_LINES) return { lines: [...lines], outcome: 'max-lines' };
    if (qty > MAX_QTY) return { lines: [...lines], outcome: 'max-qty' };
    return { lines: [...lines, { itemId, modifierIds: sorted(modifierIds), qty, ...(name ? { name } : {}) }], outcome: 'added' };
  }
  const next = (lines[at]?.qty ?? 0) + qty;
  if (next > MAX_QTY) return { lines: [...lines], outcome: 'max-qty' };
  return { lines: lines.map((l, i) => (i === at ? { ...l, qty: next } : l)), outcome: 'added' };
}

/** The stepper on an order line: +1 or -1. At zero the line goes. An unknown line changes nothing. */
export function changeLine(lines: readonly BasketLine[], id: string, delta: 1 | -1): BasketChange {
  const at = lines.findIndex((l) => idOf(l) === id);
  const current = lines[at];
  if (!current) return { lines: [...lines], outcome: 'added' };
  const next = current.qty + delta;
  if (next > MAX_QTY) return { lines: [...lines], outcome: 'max-qty' };
  if (next < 1) return { lines: lines.filter((_, i) => i !== at), outcome: 'added' };
  return { lines: lines.map((l, i) => (i === at ? { ...l, qty: next } : l)), outcome: 'added' };
}

export function removeLine(lines: readonly BasketLine[], id: string): BasketLine[] {
  return lines.filter((l) => idOf(l) !== id);
}

/** The minus on a dish row: one off the dish's most recently added line (a dish may have several, one per set of options). */
export function removeOneOf(lines: readonly BasketLine[], itemId: string): BasketLine[] {
  const current = [...lines].reverse().find((l) => l.itemId === itemId);
  return current ? changeLine(lines, idOf(current), -1).lines : [...lines];
}

/** How many of each dish are in the order, summed over its lines: the count on its row. */
export function qtyByItem(lines: readonly BasketLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.itemId] = (out[l.itemId] ?? 0) + l.qty;
  return out;
}

// --- option groups -------------------------------------------------------------------------

export interface SelectionState {
  count: number;
  /** Between the group's minimum and maximum. */
  ok: boolean;
  /** At the maximum: no more can be added. */
  full: boolean;
}

export function selectionState(group: GroupView, selected: readonly string[]): SelectionState {
  const count = group.options.filter((o) => selected.includes(o.id)).length;
  return { count, ok: count >= group.min && count <= group.max, full: count >= group.max };
}

/** Tap an option tile: a one-of group swaps the choice, a many-of group toggles up to its maximum. */
export function toggleOption(group: GroupView, selected: readonly string[], optionId: string): string[] {
  if (!group.options.some((o) => o.id === optionId)) return [...selected];
  if (selected.includes(optionId)) {
    // A required one-of group always has its choice; tapping it again keeps it.
    if (group.max === 1 && group.min >= 1) return [...selected];
    return selected.filter((id) => id !== optionId);
  }
  if (group.max === 1) return [...selected.filter((id) => !group.options.some((o) => o.id === id)), optionId];
  return selectionState(group, selected).full ? [...selected] : [...selected, optionId];
}

// --- the menu, as the basket reads it ------------------------------------------------------

export interface IndexedDish {
  dish: DishView;
  icon: string;
}
export type MenuIndex = ReadonlyMap<string, IndexedDish>;

export function indexMenu(menu: MenuView | null): MenuIndex {
  const map = new Map<string, IndexedDish>();
  for (const section of menu?.sections ?? []) for (const dish of section.items) map.set(dish.id, { dish, icon: section.icon });
  return map;
}

/** `unavailable`: the dish left the menu. `options`: a choice is gone or no longer fits its group. */
export type LineProblem = 'unavailable' | 'options' | null;

export interface LineView {
  id: string;
  itemId: string;
  qty: number;
  name: string;
  photoUrl: string | null;
  icon: string;
  optionNames: string[];
  unitPrice: number;
  lineTotal: number;
  problem: LineProblem;
}

/** The dish's price plus the price changes of the chosen options: a mirror for display. */
export function unitPriceOf(dish: DishView, modifierIds: readonly string[]): number {
  return dish.groups.flatMap((g) => g.options).reduce((sum, o) => (modifierIds.includes(o.id) ? sum + o.delta : sum), dish.unitPrice);
}

function selectionFits(dish: DishView, modifierIds: readonly string[]): boolean {
  const known = new Set(dish.groups.flatMap((g) => g.options.map((o) => o.id)));
  if (!modifierIds.every((id) => known.has(id))) return false;
  return dish.groups.every((g) => selectionState(g, modifierIds).ok);
}

/** Each line against the menu as it is now: names, mirrored prices, and what is wrong with it. */
export function resolveLines(lines: readonly BasketLine[], index: MenuIndex): LineView[] {
  return lines.map((l) => {
    const found = index.get(l.itemId);
    const id = idOf(l);
    if (!found) return { id, itemId: l.itemId, qty: l.qty, name: l.name ?? '', photoUrl: null, icon: 'dish', optionNames: [], unitPrice: 0, lineTotal: 0, problem: 'unavailable' };
    const { dish, icon } = found;
    const chosen = dish.groups.flatMap((g) => g.options).filter((o) => l.modifierIds.includes(o.id));
    const ok = selectionFits(dish, l.modifierIds);
    const unitPrice = unitPriceOf(dish, l.modifierIds);
    return {
      id,
      itemId: l.itemId,
      qty: l.qty,
      name: dish.name,
      photoUrl: dish.photoUrl,
      icon,
      optionNames: chosen.map((o) => o.name),
      unitPrice,
      lineTotal: ok ? unitPrice * l.qty : 0,
      problem: ok ? null : 'options',
    };
  });
}

export interface Totals {
  /** Dishes that can be sent (a marked line is left out). */
  count: number;
  total: number;
  /** Not empty and nothing marked. */
  canSend: boolean;
  empty: boolean;
}

export function totalsOf(views: readonly LineView[]): Totals {
  const good = views.filter((v) => v.problem === null);
  return {
    count: good.reduce((n, v) => n + v.qty, 0),
    total: good.reduce((sum, v) => sum + v.lineTotal, 0),
    canSend: views.length > 0 && good.length === views.length,
    empty: views.length === 0,
  };
}

// --- the note ------------------------------------------------------------------------------

/** Typing is cut at 140 characters (code points, as the server counts them); spaces are kept so typing flows. */
export function clipNote(raw: string): string {
  const chars = Array.from(raw);
  return chars.length > NOTE_MAX ? chars.slice(0, NOTE_MAX).join('') : raw;
}

/** What is sent: whitespace collapsed, trimmed, clipped; null when nothing is left. The server cleans it again. */
export function cleanNote(raw: string): string | null {
  const text = clipNote(raw.replace(/\s+/g, ' ').trim());
  return text === '' ? null : text;
}

export function noteCounter(note: string): { show: boolean; used: number; remaining: number } {
  const used = Array.from(note).length;
  return { show: used >= NOTE_COUNTER_FROM, used, remaining: Math.max(0, NOTE_MAX - used) };
}

// --- what goes to the server ---------------------------------------------------------------

/**
 * The request body's lines. The order has one note and the database keeps notes per line,
 * so the note rides on the first line. Option ids are sorted; no price is ever included.
 */
export function toRequest(lines: readonly BasketLine[], note: string): OrderLineRequest[] {
  const cleaned = cleanNote(note);
  return lines.map((l, i) => ({ menu_item_id: l.itemId, qty: l.qty, modifier_ids: sorted(l.modifierIds), note: i === 0 ? cleaned : null }));
}

// --- the count on the bottom bar -----------------------------------------------------------

export type CountForm = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Which counted phrase fits `n` ("1 item", "3 items"). The same CLDR rules as @rop/i18n
 * `pluralForm`, kept here because importing that module would ship both staff catalogs to
 * the phone; a test holds the two equal for every count a basket can reach.
 */
export function itemCountForm(n: number, locale: Locale): CountForm {
  if (n === 0) return 'zero';
  if (locale === 'en') return n === 1 ? 'one' : 'other';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const rem = n % 100;
  if (rem >= 3 && rem <= 10) return 'few';
  if (rem >= 11 && rem <= 99) return 'many';
  return 'other';
}
