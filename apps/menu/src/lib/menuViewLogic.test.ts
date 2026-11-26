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
    expect(en.sections[0]?.items[0]).toEqual({ id: 'i1', name: 'Hummus', price: '4,000', unitPrice: 4000, photoUrl: 'https://x/p.webp', groups: [] });
    const ar = toMenuView(menu, 'ar');
    expect(ar.sections[0]?.name).toBe('مقبلات');
    expect(ar.sections[0]?.items[0]?.name).toBe('حمص');
    expect(ar.sections[0]?.items[1]?.price).toBe('25,000');
  });
  it('falls back to the other language when a name is missing', () => {
    expect(toMenuView(menu, 'ar').sections[0]?.items[1]?.name).toBe('Tabbouleh');
  });
  it('carries the icon key and the venue name', () => {
    const view = toMenuView(menu, 'en');
    expect(view.venueName).toBe('Kagu');
    expect(view.sections[0]?.icon).toBe('mezze');
  });
  it('carries each dish\'s option groups with their limits, in the guest language, with signed price changes', () => {
    const withOptions: GuestMenu = {
      venueName: 'Kagu',
      categories: [
        {
          id: 'c1',
          nameEn: 'Grills',
          nameAr: 'مشاوي',
          icon: 'grill',
          items: [
            {
              id: 'i1',
              nameEn: 'Kebab',
              nameAr: 'كباب',
              price: 15000,
              photoUrl: null,
              modifierGroups: [
                {
                  id: 'g1',
                  nameEn: 'Side',
                  nameAr: 'الجانب',
                  minSelect: 1,
                  maxSelect: 1,
                  modifiers: [
                    { id: 'm1', nameEn: 'Rice', nameAr: 'رز', priceDelta: 0 },
                    { id: 'm2', nameEn: 'Fries', nameAr: '', priceDelta: 1500 },
                    { id: 'm3', nameEn: 'No bread', nameAr: 'بدون خبز', priceDelta: -500 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(toMenuView(withOptions, 'en').sections[0]?.items[0]?.groups).toEqual([
      {
        id: 'g1',
        name: 'Side',
        min: 1,
        max: 1,
        options: [
          { id: 'm1', name: 'Rice', delta: 0, deltaText: '' },
          { id: 'm2', name: 'Fries', delta: 1500, deltaText: '+1,500' },
          { id: 'm3', name: 'No bread', delta: -500, deltaText: '-500' },
        ],
      },
    ]);
    const ar = toMenuView(withOptions, 'ar').sections[0]?.items[0]?.groups[0];
    expect(ar?.name).toBe('الجانب');
    expect(ar?.options.map((o) => o.name)).toEqual(['رز', 'Fries', 'بدون خبز']);
  });
});
