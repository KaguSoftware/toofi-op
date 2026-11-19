// Pure helpers for the tab screen: shaping what the server returns.
import type { ModifierGroup } from './basketLogic';

/** An order line already sent (order_items joined with its order and modifiers). */
export interface SentLine {
  id: string;
  order_id: string;
  name_en: string;
  name_ar: string;
  unit_price: number;
  qty: number;
  line_total: number;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  placed_at: string;
  placed_by_name: string | null;
  modifiers: { name_en: string; name_ar: string; price_delta: number }[];
}

export interface OrderGroup {
  orderId: string;
  placedAt: string;
  placedByName: string | null;
  lines: SentLine[];
}

/** Lines grouped by the Send that created them, oldest Send first. Voided lines stay. */
export function groupSentLines(lines: readonly SentLine[]): OrderGroup[] {
  const byOrder = new Map<string, OrderGroup>();
  for (const l of [...lines].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    let g = byOrder.get(l.order_id);
    if (!g) {
      g = { orderId: l.order_id, placedAt: l.placed_at, placedByName: l.placed_by_name, lines: [] };
      byOrder.set(l.order_id, g);
    }
    g.lines.push(l);
  }
  return [...byOrder.values()].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
}

export const hasActiveLines = (lines: readonly SentLine[]): boolean => lines.some((l) => l.voided_at === null);

/** Raw shape of menu_item_modifier_groups(modifier_groups(..., modifiers(...))). */
export interface RawItemGroup {
  modifier_groups: {
    id: string;
    name_en: string;
    name_ar: string;
    min_select: number;
    max_select: number;
    modifiers: { id: string; name_en: string; name_ar: string; price_delta: number; is_active: boolean }[];
  } | null;
}

export function menuItemGroups(raw: readonly RawItemGroup[]): ModifierGroup[] {
  const out: ModifierGroup[] = [];
  for (const r of raw) {
    const g = r.modifier_groups;
    if (!g) continue;
    out.push({
      id: g.id,
      nameEn: g.name_en,
      nameAr: g.name_ar,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      modifiers: g.modifiers
        .filter((m) => m.is_active)
        .map((m) => ({ id: m.id, nameEn: m.name_en, nameAr: m.name_ar, priceDelta: m.price_delta })),
    });
  }
  return out;
}

export const localName = (locale: string, v: { name_en: string; name_ar: string }): string =>
  locale === 'ar' ? v.name_ar : v.name_en;
