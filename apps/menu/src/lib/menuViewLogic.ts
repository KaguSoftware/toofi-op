/** The menu as the screen draws it: one language, prices already formatted, no option data yet. */
import { formatNumber, type Locale } from '@rop/i18n';
import type { GuestMenu } from './menuLogic';

export interface DishView {
  id: string;
  name: string;
  /** A plain number with a thousands separator: no currency on a dish row. */
  price: string;
  photoUrl: string | null;
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
        photoUrl: i.photoUrl,
      })),
    })),
  };
}
