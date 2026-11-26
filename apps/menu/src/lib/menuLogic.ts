/**
 * `app.guest_menu()` read defensively into the shape the guest UI renders, with photo URLs
 * built here on the server. Shape (spec.md, plus ticket 02's `icon` and `photo_path`):
 * {venue: {name}, categories: [{id, name_en, name_ar, sort, icon, items: [{id, name_en, name_ar,
 * price, sort, photo_path, modifier_groups: [{id, name_en, name_ar, min_select, max_select,
 * modifiers: [{id, name_en, name_ar, price_delta}]}]}]}]}
 */
import { PHOTO_BUCKET_PATH } from './securityLogic';

export interface GuestModifier {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDelta: number;
}

export interface GuestModifierGroup {
  id: string;
  nameEn: string;
  nameAr: string;
  minSelect: number;
  maxSelect: number;
  modifiers: GuestModifier[];
}

export interface GuestItem {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Display only: a mirror of the menu. The server prices every order itself. */
  price: number;
  photoUrl: string | null;
  modifierGroups: GuestModifierGroup[];
}

export interface GuestCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  /** A key of @rop/core CATEGORY_ICONS (ticket 02); 'dish' when the database has none. */
  icon: string;
  items: GuestItem[];
}

export interface GuestMenu {
  venueName: string;
  categories: GuestCategory[];
}

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const int = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v : 0);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);

/** An object path inside the bucket: plain segments, no traversal, no scheme. */
const PHOTO_PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** `{SUPABASE_URL}/storage/v1/object/public/menu-photos/{photo_path}`, or null for no photo or an odd path. */
export function photoUrl(supabaseUrl: string, photoPath: unknown): string | null {
  if (typeof photoPath !== 'string' || !PHOTO_PATH_RE.test(photoPath)) return null;
  if (photoPath.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
  return `${origin}${PHOTO_BUCKET_PATH}${photoPath}`;
}

/** Null when the answer is not a menu at all; a menu with no categories is a real, empty menu. */
export function parseGuestMenu(data: unknown, supabaseUrl: string): GuestMenu | null {
  if (!isRow(data) || !Array.isArray(data.categories)) return null;
  const venue = isRow(data.venue) ? data.venue : {};
  return {
    venueName: str(venue.name),
    categories: rows(data.categories).map((c) => ({
      id: str(c.id),
      nameEn: str(c.name_en),
      nameAr: str(c.name_ar),
      icon: str(c.icon) || 'dish',
      items: rows(c.items).map((i) => ({
        id: str(i.id),
        nameEn: str(i.name_en),
        nameAr: str(i.name_ar),
        price: int(i.price),
        photoUrl: photoUrl(supabaseUrl, i.photo_path),
        modifierGroups: rows(i.modifier_groups).map((g) => ({
          id: str(g.id),
          nameEn: str(g.name_en),
          nameAr: str(g.name_ar),
          minSelect: int(g.min_select),
          maxSelect: int(g.max_select),
          modifiers: rows(g.modifiers).map((m) => ({
            id: str(m.id),
            nameEn: str(m.name_en),
            nameAr: str(m.name_ar),
            priceDelta: int(m.price_delta),
          })),
        })),
      })),
    })),
  };
}
