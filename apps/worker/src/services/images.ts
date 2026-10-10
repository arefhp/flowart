import { IMAGE_WIDTHS, LIMITS, parseWebpSize, type ImageWidth } from '@flowart/shared';
import type { Env } from '../env';
import { audit } from '../lib/audit';
import { HttpError } from '../lib/http';

export interface ValidatedUpload {
  variants: Record<ImageWidth, Uint8Array>;
  /** pixel size of the largest variant */
  width: number;
  height: number;
}

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * The Worker never trusts the browser (spec section 10). Every variant is checked by magic
 * bytes, size and parsed dimensions; a missing size, a wrong aspect ratio or a non-WebP file
 * rejects the whole upload.
 */
export async function validateUpload(form: FormData): Promise<ValidatedUpload> {
  const variants = {} as Record<ImageWidth, Uint8Array>;
  const sizes = {} as Record<ImageWidth, { width: number; height: number }>;

  for (const w of IMAGE_WIDTHS) {
    const field = form.get(`w${w}`);
    if (!(field instanceof File)) {
      throw new HttpError(400, 'invalid_image', `The ${w}px image is missing.`);
    }
    if (field.size === 0) throw new HttpError(400, 'invalid_image', `The ${w}px image is empty.`);
    if (field.size > LIMITS.variantMaxBytes) {
      throw new HttpError(413, 'image_too_large', `The ${w}px image is larger than 4 MB.`);
    }
    const bytes = new Uint8Array(await field.arrayBuffer());
    const size = parseWebpSize(bytes);
    if (!size) throw new HttpError(400, 'invalid_image', `The ${w}px image is not a valid WebP file.`);
    if (size.width > w || size.width < 16 || size.height < 16 || size.height > 20000) {
      throw new HttpError(400, 'invalid_image', `The ${w}px image has unexpected dimensions.`);
    }
    variants[w] = bytes;
    sizes[w] = size;
  }

  const largest = sizes[1920];
  const ratio = largest.width / largest.height;
  for (const w of IMAGE_WIDTHS) {
    const r = sizes[w].width / sizes[w].height;
    if (Math.abs(r - ratio) / ratio > 0.03) {
      throw new HttpError(400, 'invalid_image', 'The image sizes do not have the same proportions.');
    }
  }
  return { variants, width: largest.width, height: largest.height };
}

export function variantKeys(base: string): string[] {
  return IMAGE_WIDTHS.map((w) => `${base}-${w}.webp`);
}

export async function putVariants(bucket: R2Bucket, base: string, upload: ValidatedUpload): Promise<void> {
  const done: string[] = [];
  try {
    for (const w of IMAGE_WIDTHS) {
      const key = `${base}-${w}.webp`;
      await bucket.put(key, upload.variants[w], {
        httpMetadata: { contentType: 'image/webp', cacheControl: CACHE_CONTROL },
      });
      done.push(key);
    }
  } catch (err) {
    if (done.length) await bucket.delete(done).catch(() => undefined);
    throw err;
  }
}

/**
 * Delete the R2 objects of an image. Failures are recorded unresolved in `audit_log` so the
 * cron job retries them (spec section 10); they never fail the admin request.
 */
export async function deleteVariants(env: Env, actor: string, base: string): Promise<void> {
  const keys = variantKeys(base);
  try {
    await env.MEDIA.delete(keys);
  } catch (err) {
    await audit(env, actor, 'r2_delete_failed', 'r2', base, { keys, error: String(err).slice(0, 200) }, { resolved: false });
  }
}

/** Cron: retry R2 deletions that failed earlier. */
export async function retryFailedDeletes(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, details FROM audit_log WHERE action = 'r2_delete_failed' AND resolved = 0 LIMIT 20`,
  ).all<{ id: string; details: string | null }>();
  let fixed = 0;
  for (const row of rows.results) {
    try {
      const keys = (JSON.parse(row.details ?? '{}') as { keys?: string[] }).keys ?? [];
      if (keys.length) await env.MEDIA.delete(keys);
      await env.DB.prepare('UPDATE audit_log SET resolved = 1 WHERE id = ?1').bind(row.id).run();
      fixed++;
    } catch {
      // leave unresolved; the next run tries again
    }
  }
  return fixed;
}
