import { describe, expect, it, vi } from 'vitest';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE,
  PHOTO_MAX_SOURCE_BYTES,
  fitWithin,
  isPhotoSource,
  menuPhotoPath,
  photoErrorKey,
  missingPhotoCount,
  shrinkToFit,
} from './photoLogic';

describe('fitWithin', () => {
  it('shrinks the long side to 800 and keeps the shape', () => {
    expect(PHOTO_MAX_EDGE).toBe(800);
    expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 600, height: 800 });
  });
  it('never makes a small photo bigger', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(800, 800)).toEqual({ width: 800, height: 800 });
  });
  it('scales further when asked, and never reaches zero', () => {
    expect(fitWithin(4000, 3000, 0.5)).toEqual({ width: 400, height: 300 });
    expect(fitWithin(4000, 1, 1)).toEqual({ width: 800, height: 1 });
  });
  it('rejects a size that is not positive', () => {
    expect(() => fitWithin(0, 100)).toThrow(RangeError);
    expect(() => fitWithin(100, Number.NaN)).toThrow(RangeError);
  });
});

describe('menuPhotoPath', () => {
  it('is {venue}/items/{item}/{id}.webp', () => {
    expect(menuPhotoPath('v1', 'i1', '01HZ')).toBe('v1/items/i1/01HZ.webp');
  });
});

describe('isPhotoSource', () => {
  it('takes a picture file under the size cap', () => {
    expect(isPhotoSource({ type: 'image/jpeg', size: 3_000_000 })).toBe(true);
    expect(isPhotoSource({ type: 'image/png', size: 100 })).toBe(true);
  });
  it('refuses other files and huge ones', () => {
    expect(isPhotoSource({ type: 'application/pdf', size: 100 })).toBe(false);
    expect(isPhotoSource({ type: '', size: 100 })).toBe(false);
    expect(isPhotoSource({ type: 'image/jpeg', size: PHOTO_MAX_SOURCE_BYTES + 1 })).toBe(false);
    expect(isPhotoSource({ type: 'image/jpeg', size: 0 })).toBe(false);
  });
});

describe('shrinkToFit', () => {
  const blob = (size: number) => ({ size }) as Blob;

  it('stops at the first attempt that is under 300 KB', async () => {
    expect(PHOTO_MAX_BYTES).toBe(300 * 1024);
    const encode = vi.fn(async (_scale: number, quality: number) => blob(quality > 0.8 ? 400_000 : 200_000));
    const out = await shrinkToFit(encode);
    expect(out.size).toBe(200_000);
    expect(encode.mock.calls.length).toBeGreaterThan(1);
    expect(encode.mock.calls[0]?.[0]).toBe(1);
  });

  it('uses a smaller picture when quality alone is not enough', async () => {
    const encode = async (scale: number) => blob(scale < 1 ? 100_000 : 900_000);
    expect((await shrinkToFit(encode)).size).toBe(100_000);
  });

  it('gives up with PHOTO_TOO_LARGE when nothing fits', async () => {
    await expect(shrinkToFit(async () => blob(PHOTO_MAX_BYTES + 1))).rejects.toThrow('PHOTO_TOO_LARGE');
  });

  it('gives up with PHOTO_ENCODE_FAILED when the browser cannot encode', async () => {
    await expect(shrinkToFit(async () => null)).rejects.toThrow('PHOTO_ENCODE_FAILED');
  });
});

describe('missingPhotoCount', () => {
  it('counts active dishes without a photo; inactive dishes are not on the guest menu', () => {
    const items = [
      { is_active: true, photo_path: null },
      { is_active: true, photo_path: 'v/items/i/a.webp' },
      { is_active: false, photo_path: null },
      { is_active: true, photo_path: null },
    ];
    expect(missingPhotoCount(items)).toBe(2);
  });
});

describe('photoErrorKey', () => {
  it('names the problems the browser steps can have', () => {
    expect(photoErrorKey(new Error('PHOTO_TOO_LARGE'))).toBe('guestSetup.photoTooLarge');
    expect(photoErrorKey(new Error('PHOTO_UNREADABLE'))).toBe('guestSetup.photoUnreadable');
    expect(photoErrorKey(new Error('PHOTO_ENCODE_FAILED'))).toBe('guestSetup.photoUnreadable');
  });
  it('leaves every other error to the shared error text', () => {
    expect(photoErrorKey(new Error('FORBIDDEN'))).toBeNull();
    expect(photoErrorKey('PHOTO_TOO_LARGE')).toBeNull();
  });
});
