import { IMAGE_WIDTHS } from '@flowart/shared';

/**
 * Prepare an artwork photo in the browser (spec section 10): apply the EXIF orientation, draw it
 * at 480 / 960 / 1920 px wide (never enlarged past the original), and export WebP at quality 0.82.
 * Canvas export drops EXIF and GPS data, so location metadata never leaves the owner's computer.
 */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export const ACCEPT_ATTR = ACCEPTED.join(',');

export class ImagePrepError extends Error {}

export interface PreparedImage {
  /** keyed by nominal width */
  blobs: Record<(typeof IMAGE_WIDTHS)[number], Blob>;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new ImagePrepError('The browser could not create the image.'));
        else if (blob.type !== 'image/webp') {
          reject(new ImagePrepError('This browser cannot create WebP images. Please use a recent Chrome, Edge or Firefox.'));
        } else resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImagePrepError(`${file.name}: please choose a JPEG, PNG or WebP photo.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImagePrepError(`${file.name}: the file is larger than 40 MB.`);
  }

  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF orientation, so photos taken in portrait are not sideways
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImagePrepError(`${file.name}: this file could not be read as an image.`);
  }

  try {
    const blobs = {} as PreparedImage['blobs'];
    let largest = { width: 0, height: 0 };
    for (const nominal of IMAGE_WIDTHS) {
      const width = Math.min(nominal, bitmap.width);
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImagePrepError('The browser could not create the image.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      blobs[nominal] = await toBlob(canvas, 0.82);
      if (nominal === 1920) largest = { width, height };
    }
    return { blobs, ...largest };
  } finally {
    bitmap.close();
  }
}

/** Multipart body expected by the upload endpoints. */
export function uploadFormData(prepared: PreparedImage, fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const w of IMAGE_WIDTHS) form.set(`w${w}`, new File([prepared.blobs[w]], `v${w}.webp`, { type: 'image/webp' }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
