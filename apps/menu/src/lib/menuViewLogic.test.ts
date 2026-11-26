import { describe, expect, it } from 'vitest';
import type { GuestMenu } from './menuLogic';
import { toMenuView } from './menuViewLogic';

const menu: GuestMenu = {
  venueName: 'Kagu',
  categories: [
    {
      id: 'c1',
      nameEn: 'Mezze',
      nameAr: 'مقبلات',
      icon: 'mezze',
      items: [
        { id: 'i1', nameEn: 'Hummus', nameAr: 'حمص', price: 4000, photoUrl: 'https://x/p.webp', modifierGroups: [] },
        { id: 'i2', nameEn: 'Tabbouleh', nameAr: '', price: 25000, photoUrl: null, modifierGroups: [] },
      ],
    },
  ],
};

describe('toMenuView', () => {
  it('picks the guest language, and shows a plain number with a thousands separator', () => {
    const en = toMenuView(menu, 'en');
    expect(en.sections[0]?.name).toBe('Mezze');
    expect(en.sections[0]?.items[0]).toEqual({ id: 'i1', name: 'Hummus', price: '4,000', photoUrl: 'https://x/p.webp' });
    const ar = toMenuView(menu, 'ar');
    expect(ar.sections[0]?.name).toBe('مقبلات');
    expect(ar.sections[0]?.items[0]?.name).toBe('حمص');
    expect(ar.sections[0]?.items[1]?.price).toBe('25,000');
  });
  it('falls back to the other language when a name is missing', () => {
    expect(toMenuView(menu, 'ar').sections[0]?.items[1]?.name).toBe('Tabbouleh');
  });
  it('carries the icon key and the venue name, and leaves modifiers out', () => {
    const view = toMenuView(menu, 'en');
    expect(view.venueName).toBe('Kagu');
    expect(view.sections[0]?.icon).toBe('mezze');
    expect(JSON.stringify(view)).not.toContain('modifier');
  });
});
