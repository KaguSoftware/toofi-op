// Pure logic for dish photos: how big, where it is stored, and how a picture is squeezed under
// the limit. The browser parts (decode, canvas) live in photoResize.ts. No react, no supabase.

import type { MessageKey } from '@rop/i18n';

/** The long side of a stored photo, in pixels. */
export const PHOTO_MAX_EDGE = 800;
/** A stored photo stays under this. The bucket allows 1 MB; the menu loads fast under 300 KB. */
export const PHOTO_MAX_BYTES = 300 * 1024;
/** The biggest file we will try to open: a phone photo is a few MB. */
export const PHOTO_MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export function fitWithin(width: number, height: number, scale = 1): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new RangeError('photo size must be positive');
  const k = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height)) * scale;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** The object's path inside the `menu-photos` bucket: {venue_id}/items/{item_id}/{id}.webp */
export function menuPhotoPath(venueId: string, itemId: string, id: string): string {
  return `${venueId}/items/${itemId}/${id}.webp`;
}

/** A picture file of a sane size. The browser decides whether it can really open it. */
export function isPhotoSource(file: { type: string; size: number }): boolean {
  return file.type.startsWith('image/') && file.size > 0 && file.size <= PHOTO_MAX_SOURCE_BYTES;
}

const SCALES = [1, 0.8, 0.65, 0.5] as const;
const QUALITIES = [0.85, 0.75, 0.65, 0.5] as const;

/**
 * Try quality steps at full size, then again at smaller sizes, until the encoded picture is
 * under PHOTO_MAX_BYTES. `encode` returns null when the browser cannot produce WebP.
 */
export async function shrinkToFit(encode: (scale: number, quality: number) => Promise<Blob | null>): Promise<Blob> {
  for (const scale of SCALES) {
    for (const quality of QUALITIES) {
      const blob = await encode(scale, quality);
      if (!blob) throw new Error('PHOTO_ENCODE_FAILED');
      if (blob.size <= PHOTO_MAX_BYTES) return blob;
    }
  }
  throw new Error('PHOTO_TOO_LARGE');
}

/** Active dishes that still have no photo: the ones the guest menu shows bare. */
export function missingPhotoCount(items: readonly { is_active: boolean; photo_path: string | null }[]): number {
  return items.filter((i) => i.is_active && !i.photo_path).length;
}

/** The message for a failure that happens in the browser before anything is sent; null for any other error. */
export function photoErrorKey(error: unknown): MessageKey | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'PHOTO_TOO_LARGE') return 'guestSetup.photoTooLarge';
  if (error.message === 'PHOTO_UNREADABLE' || error.message === 'PHOTO_ENCODE_FAILED') return 'guestSetup.photoUnreadable';
  return null;
}
