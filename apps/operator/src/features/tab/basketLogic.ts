// Pure basket logic for the tab screen: lines not yet sent to the kitchen.
// The server owns prices; the preview here only mirrors them for display.

export const MAX_QTY = 999;

export interface ModifierOption {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  nameEn: string;
  nameAr: string;
  minSelect: number;
  maxSelect: number;
  modifiers: ModifierOption[];
}

export interface NewLine {
  menuItemId: string;
  nameEn: string;
  nameAr: string;
  basePrice: number;
  modifiers: ModifierOption[];
  qty: number;
  note: string;
}

export interface BasketLine extends NewLine {
  /** Local id, only for React keys and edits. */
  id: string;
}

export interface Basket {
  lines: BasketLine[];
  /** Idempotency key of the current basket version; null after any edit. */
  sendKey: string | null;
}

export const emptyBasket = (): Basket => ({ lines: [], sendKey: null });

const clampQty = (q: number) => Math.min(MAX_QTY, Math.max(0, Math.trunc(q)));

/** (price + modifier deltas) x qty. */
export function linePrice(basePrice: number, modifiers: readonly { priceDelta: number }[], qty: number): number {
  return (basePrice + modifiers.reduce((s, m) => s + m.priceDelta, 0)) * qty;
}

export const basketLinePrice = (l: NewLine) => linePrice(l.basePrice, l.modifiers, l.qty);
export const basketTotal = (b: Basket) => b.lines.reduce((s, l) => s + basketLinePrice(l), 0);

function sameLine(a: NewLine, b: NewLine): boolean {
  const ids = (l: NewLine) =>
    l.modifiers
      .map((m) => m.id)
      .sort()
      .join(',');
  return a.menuItemId === b.menuItemId && ids(a) === ids(b) && a.note.trim() === b.note.trim();
}

let counter = 0;
const localId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

const edited = (lines: BasketLine[]): Basket => ({ lines, sendKey: null });

/** Add a line; an identical line (same item, modifiers, note) just gains qty. */
export function addLine(b: Basket, line: NewLine): Basket {
  const qty = clampQty(line.qty);
  if (qty < 1) return b;
  const i = b.lines.findIndex((l) => sameLine(l, line));
  if (i >= 0) {
    return edited(b.lines.map((l, j) => (j === i ? { ...l, qty: clampQty(l.qty + qty) } : l)));
  }
  return edited([...b.lines, { ...line, qty, note: line.note.trim(), id: localId() }]);
}

export function setQty(b: Basket, id: string, qty: number): Basket {
  const q = clampQty(qty);
  return edited(q < 1 ? b.lines.filter((l) => l.id !== id) : b.lines.map((l) => (l.id === id ? { ...l, qty: q } : l)));
}

export const removeLine = (b: Basket, id: string): Basket => edited(b.lines.filter((l) => l.id !== id));

export const setNote = (b: Basket, id: string, note: string): Basket =>
  edited(b.lines.map((l) => (l.id === id ? { ...l, note: note.trim() } : l)));

// ---- modifier selection (mirrors add_items' min_select / max_select check) ----

export interface ModifierError {
  groupId: string;
  kind: 'min' | 'max';
}

export function modifierErrors(groups: readonly ModifierGroup[], selected: readonly string[]): ModifierError[] {
  const out: ModifierError[] = [];
  for (const g of groups) {
    const n = g.modifiers.filter((m) => selected.includes(m.id)).length;
    if (n < g.minSelect) out.push({ groupId: g.id, kind: 'min' });
    else if (n > g.maxSelect) out.push({ groupId: g.id, kind: 'max' });
  }
  return out;
}

/** Tap on a modifier: deselect if chosen; in a single-choice group replace; else add up to max. */
export function toggleModifier(g: ModifierGroup, selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  const own = g.modifiers.map((m) => m.id);
  if (g.maxSelect === 1) return [...selected.filter((s) => !own.includes(s)), id];
  const count = selected.filter((s) => own.includes(s)).length;
  return count >= g.maxSelect ? [...selected] : [...selected, id];
}

// ---- send ----

export function toPayload(b: Basket) {
  return b.lines.map((l) => ({
    menu_item_id: l.menuItemId,
    qty: l.qty,
    modifier_ids: l.modifiers.map((m) => m.id),
    note: l.note === '' ? null : l.note,
  }));
}

/** Give the current basket version a key, once. Retrying the same basket reuses it. */
export function ensureSendKey(b: Basket, make: () => string): Basket {
  return b.sendKey ? b : { ...b, sendKey: make() };
}

/** After an unclear send: did a new order appear that was not there before the send? */
export function sendLanded(orderIdsBefore: ReadonlySet<string>, linesNow: readonly { order_id: string }[]): boolean {
  return linesNow.some((l) => !orderIdsBefore.has(l.order_id));
}

// ---- persistence (per tab, so a reload does not lose the basket) ----

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storeKey = (tabId: string) => `rop.basket.${tabId}`;

export function saveBasket(store: Store | null, tabId: string, b: Basket): void {
  try {
    if (b.lines.length === 0) store?.removeItem(storeKey(tabId));
    else store?.setItem(storeKey(tabId), JSON.stringify(b));
  } catch {
    /* storage blocked: the basket lives in memory only */
  }
}

export function loadBasket(store: Store | null, tabId: string): Basket {
  try {
    const raw = store?.getItem(storeKey(tabId));
    if (!raw) return emptyBasket();
    const o = JSON.parse(raw) as Partial<Basket>;
    if (!Array.isArray(o.lines)) return emptyBasket();
    const lines = o.lines.filter(
      (l): l is BasketLine =>
        !!l &&
        typeof l.id === 'string' &&
        typeof l.menuItemId === 'string' &&
        Number.isInteger(l.qty) &&
        l.qty > 0 &&
        Array.isArray(l.modifiers),
    );
    return { lines, sendKey: typeof o.sendKey === 'string' ? o.sendKey : null };
  } catch {
    return emptyBasket();
  }
}
