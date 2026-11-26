/** The menu as the screen draws it: one language, prices already formatted, with each dish's option groups. */
import { formatNumber, type Locale } from '@rop/i18n';
import type { GuestMenu } from './menuLogic';

export interface OptionView {
  id: string;
  name: string;
  /** Display only: the server prices an order. */
  delta: number;
  /** `+1,000` or `-500`; empty when the option costs nothing extra. */
  deltaText: string;
}

export interface GroupView {
  id: string;
  name: string;
  min: number;
  max: number;
  options: OptionView[];
}

export interface DishView {
  id: string;
  name: string;
  /** A plain number with a thousands separator: no currency on a dish row. */
  price: string;
  /** The same price as a number, for the basket's mirrored totals. */
  unitPrice: number;
  photoUrl: string | null;
  /** Empty for a dish with nothing to choose. */
  groups: GroupView[];
}

export interface SectionView {
  id: string;
  name: string;
  /** A key of the category icon set; the screen falls back to the plate for an unknown one. */
  icon: string;
  items: DishView[];
}

export interface MenuView {
  venueName: string;
  sections: SectionView[];
}

const deltaText = (delta: number, locale: Locale): string => (delta === 0 ? '' : `${delta > 0 ? '+' : '-'}${formatNumber(Math.abs(delta), locale)}`);

const pick = (locale: Locale, en: string, ar: string): string => (locale === 'ar' ? ar || en : en || ar);

export function toMenuView(menu: GuestMenu, locale: Locale): MenuView {
  return {
    venueName: menu.venueName,
    sections: menu.categories.map((c) => ({
      id: c.id,
      name: pick(locale, c.nameEn, c.nameAr),
      icon: c.icon,
      items: c.items.map((i) => ({
        id: i.id,
        name: pick(locale, i.nameEn, i.nameAr),
        price: formatNumber(i.price, locale),
        unitPrice: i.price,
        photoUrl: i.photoUrl,
        groups: i.modifierGroups.map((g) => ({
          id: g.id,
          name: pick(locale, g.nameEn, g.nameAr),
          min: g.minSelect,
          max: g.maxSelect,
          options: g.modifiers.map((m) => ({ id: m.id, name: pick(locale, m.nameEn, m.nameAr), delta: m.priceDelta, deltaText: deltaText(m.priceDelta, locale) })),
        })),
      })),
    })),
  };
}
