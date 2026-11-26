// The browser part of a dish photo: open the picture, draw it at most 800 px on the long side,
// and encode it as WebP under 300 KB. The size maths and the retry steps are in photoLogic.ts.
import { fitWithin, shrinkToFit } from './photoLogic';

/** Throws 'PHOTO_UNREADABLE' when the file is not a picture the browser can open. */
export async function resizeToWebp(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('PHOTO_UNREADABLE');
  }
  try {
    return await shrinkToFit(async (scale, quality) => {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      // A browser that cannot encode WebP hands back a PNG: that is not what the bucket accepts.
      return blob && blob.type === 'image/webp' ? blob : null;
    });
  } finally {
    bitmap.close();
  }
}
