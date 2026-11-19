// Pure logic for menu, modifier and floor admin forms. Validation mirrors the server
// (the server is still the authority); it only lets the form show a problem inline.
import type { MessageKey } from '@rop/i18n';

export type Problem = MessageKey | null;

export interface ItemForm {
  nameEn: string;
  nameAr: string;
  /** Whole IQD, tax-inclusive. */
  price: number;
  categoryId: string;
  taxGroupId: string;
  sort: number;
}

export type ItemErrors = Partial<Record<keyof ItemForm, MessageKey>>;

export function validateItem(f: ItemForm): ItemErrors {
  const e: ItemErrors = {};
  if (!f.nameEn.trim()) e.nameEn = 'manage.err.nameRequired';
  if (!f.nameAr.trim()) e.nameAr = 'manage.err.nameRequired';
  if (!Number.isInteger(f.price) || f.price < 0) e.price = 'manage.err.priceInvalid';
  if (!f.categoryId) e.categoryId = 'manage.err.categoryRequired';
  if (!f.taxGroupId) e.taxGroupId = 'manage.err.taxGroupRequired';
  if (!Number.isInteger(f.sort)) e.sort = 'manage.err.sortInvalid';
  return e;
}

export interface NamesForm {
  nameEn: string;
  nameAr: string;
}
export function validateNames(f: NamesForm): ItemErrors {
  const e: ItemErrors = {};
  if (!f.nameEn.trim()) e.nameEn = 'manage.err.nameRequired';
  if (!f.nameAr.trim()) e.nameAr = 'manage.err.nameRequired';
  return e;
}

export interface GroupForm extends NamesForm {
  minSelect: number;
  maxSelect: number;
}
export type GroupErrors = Partial<Record<keyof GroupForm, MessageKey>>;

/** min >= 0, max >= 1, min <= max (MODIFIER_RANGE_INVALID on the server). */
export function validateGroup(f: GroupForm): GroupErrors {
  const e: GroupErrors = { ...validateNames(f) };
  if (!Number.isInteger(f.minSelect) || f.minSelect < 0) e.minSelect = 'manage.err.minInvalid';
  if (!Number.isInteger(f.maxSelect) || f.maxSelect < 1) e.maxSelect = 'manage.err.maxInvalid';
  else if (Number.isInteger(f.minSelect) && f.minSelect > f.maxSelect) e.maxSelect = 'manage.err.maxBelowMin';
  return e;
}

export function validateTaxGroup(name: string, rateBps: number): Partial<Record<'name' | 'rate', MessageKey>> {
  const e: Partial<Record<'name' | 'rate', MessageKey>> = {};
  if (!name.trim()) e.name = 'manage.err.nameRequired';
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) e.rate = 'manage.err.rateInvalid';
  return e;
}

export interface TableForm {
  label: string;
  areaId: string;
  seats: number;
  gridX: number;
  gridY: number;
}
export function validateTable(f: TableForm): Partial<Record<keyof TableForm, MessageKey>> {
  const e: Partial<Record<keyof TableForm, MessageKey>> = {};
  if (!f.label.trim()) e.label = 'manage.err.labelRequired';
  if (!f.areaId) e.areaId = 'manage.err.areaRequired';
  if (!Number.isInteger(f.seats) || f.seats < 1) e.seats = 'manage.err.seatsInvalid';
  if (!Number.isInteger(f.gridX) || f.gridX < 0) e.gridX = 'manage.err.gridInvalid';
  if (!Number.isInteger(f.gridY) || f.gridY < 0) e.gridY = 'manage.err.gridInvalid';
  return e;
}

export const hasErrors = (e: object): boolean => Object.keys(e).length > 0;

/** Basis points as a percent string: 1500 -> '15', 750 -> '7.5'. */
export function bpsToPercent(bps: number): string {
  return String(bps / 100);
}

/** Move the id at `index` one step (-1 up, +1 down); the same list when it cannot move. */
export function moveId(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  const a = out[index] as string;
  out[index] = out[to] as string;
  out[to] = a;
  return out;
}

/** Parse a typed integer; NaN for empty or fractional text. */
export function parseIntStrict(text: string): number {
  return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
}
