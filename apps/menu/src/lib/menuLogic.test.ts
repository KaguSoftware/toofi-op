import { describe, expect, it } from 'vitest';
import { parseGuestMenu, photoUrl } from './menuLogic';

const URL_ = 'http://127.0.0.1:55421';

const raw = {
  venue: { name: 'Kagu' },
  categories: [
    {
      id: 'c1',
      name_en: 'Grills',
      name_ar: 'مشاوي',
      sort: 1,
      icon: 'grill',
      items: [
        {
          id: 'i1',
          name_en: 'Lamb Kebab',
          name_ar: 'كباب لحم',
          price: 15000,
          sort: 1,
          photo_path: 'venue-1/items/i1/v1.webp',
          cost: 9000,
          modifier_groups: [
            { id: 'g1', name_en: 'Doneness', name_ar: 'الاستواء', min_select: 1, max_select: 1, modifiers: [{ id: 'm1', name_en: 'Medium', name_ar: 'وسط', price_delta: 0 }] },
          ],
        },
        { id: 'i2', name_en: 'Tikka', name_ar: 'تكة', price: 12000, sort: 2, photo_path: null, modifier_groups: [] },
      ],
    },
  ],
};

describe('parseGuestMenu', () => {
  it('maps the database shape and builds photo URLs on the server', () => {
    const menu = parseGuestMenu(raw, URL_);
    expect(menu?.venueName).toBe('Kagu');
    const cat = menu?.categories[0];
    expect(cat).toMatchObject({ id: 'c1', nameEn: 'Grills', nameAr: 'مشاوي', icon: 'grill' });
    expect(cat?.items[0]).toMatchObject({
      id: 'i1',
      price: 15000,
      photoUrl: 'http://127.0.0.1:55421/storage/v1/object/public/menu-photos/venue-1/items/i1/v1.webp',
    });
    expect(cat?.items[0]?.modifierGroups[0]).toMatchObject({ minSelect: 1, maxSelect: 1, modifiers: [{ id: 'm1', priceDelta: 0 }] });
    expect(cat?.items[1]?.photoUrl).toBeNull();
  });

  it('never carries fields the guest should not see', () => {
    expect(JSON.stringify(parseGuestMenu(raw, URL_))).not.toContain('9000');
  });

  it('defaults a missing icon (a stack without ticket 02) to dish', () => {
    const { icon: _icon, ...noIcon } = raw.categories[0]!;
    expect(parseGuestMenu({ ...raw, categories: [noIcon] }, URL_)?.categories[0]?.icon).toBe('dish');
  });

  it('is null for something that is not a menu, and empty for an empty one', () => {
    expect(parseGuestMenu(null, URL_)).toBeNull();
    expect(parseGuestMenu({ venue: {} }, URL_)).toBeNull();
    expect(parseGuestMenu({ venue: { name: 'x' }, categories: [] }, URL_)?.categories).toEqual([]);
  });
});

describe('photoUrl', () => {
  it('refuses traversal, absolute URLs and odd characters', () => {
    expect(photoUrl(URL_, '../secret')).toBeNull();
    expect(photoUrl(URL_, 'a/../../b')).toBeNull();
    expect(photoUrl(URL_, 'https://evil.example/x.jpg')).toBeNull();
    expect(photoUrl(URL_, '/abs/x.jpg')).toBeNull();
    expect(photoUrl(URL_, 'a b.jpg')).toBeNull();
    expect(photoUrl(URL_, '')).toBeNull();
    expect(photoUrl('not a url', 'a.jpg')).toBeNull();
  });

  it('uses the origin only, whatever path the env URL has', () => {
    expect(photoUrl('https://proj.supabase.co/', 'v/items/i/1.jpg')).toBe('https://proj.supabase.co/storage/v1/object/public/menu-photos/v/items/i/1.jpg');
  });
});
