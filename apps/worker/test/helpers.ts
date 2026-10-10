import { env } from 'cloudflare:workers';
import { app } from '../src/index';
import type { Env } from '../src/env';
import { nowIso, uuid } from '../src/lib/http';

/** The default test environment: local development with the admin bypass on. */
export function testEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  return { ...(env as unknown as Env), ...(overrides as Partial<Env>) };
}

export const ADMIN_HEADERS = {
  Origin: 'http://localhost:3000',
  'X-Admin-Request': '1',
};

/** Call the app in-process with a chosen environment. */
export async function call(
  path: string,
  init: RequestInit = {},
  overrides: Partial<Record<keyof Env, unknown>> = {},
): Promise<Response> {
  const pending: Promise<unknown>[] = [];
  const res = await app.request(path, init, testEnv(overrides), {
    waitUntil: (p: Promise<unknown>) => void pending.push(p.catch(() => undefined)),
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext);
  // Background work (email sending, rebuild triggers) finishes before the test inspects state.
  await Promise.all(pending);
  return res;
}

/** State-changing admin request with the CSRF headers a real browser session sends. */
export function adminJson(path: string, method: string, body?: unknown, overrides: Partial<Record<keyof Env, unknown>> = {}) {
  return call(
    path,
    {
      method,
      headers: { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    overrides,
  );
}

/** Build the smallest valid WebP header (VP8X) for a given pixel size. */
export function makeWebp(width: number, height: number, padTo = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(padTo, 30));
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  const riff = bytes.length - 8;
  bytes[4] = riff & 0xff;
  bytes[5] = (riff >> 8) & 0xff;
  bytes[6] = (riff >> 16) & 0xff;
  bytes[7] = (riff >> 24) & 0xff;
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
  bytes[16] = 10; // chunk size
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

/** Multipart body for an image upload: three variants with proportions 4:5. */
export function uploadForm(opts: { alt?: string; altDa?: string; skip?: number; ratioOff?: boolean } = {}): FormData {
  const form = new FormData();
  for (const w of [480, 960, 1920] as const) {
    if (opts.skip === w) continue;
    const h = Math.round(w * 1.25) + (opts.ratioOff && w === 960 ? 200 : 0);
    form.set(`w${w}`, new File([makeWebp(w, h)], `v${w}.webp`, { type: 'image/webp' }));
  }
  form.set('alt_text', opts.alt ?? 'A test painting');
  if (opts.altDa) form.set('alt_text_da', opts.altDa);
  return form;
}

export function adminUpload(path: string, form: FormData, overrides: Partial<Record<keyof Env, unknown>> = {}) {
  return call(path, { method: 'POST', headers: ADMIN_HEADERS, body: form }, overrides);
}

export interface ArtworkFields {
  title: string;
  title_da: string | null;
  description: string | null;
  description_da: string | null;
  price_minor: number | null;
  currency: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  medium: string | null;
  medium_da: string | null;
  year: number | null;
  status: string;
  featured: boolean;
  category_id: string;
  size_class: string;
}

/** The two categories created by migration 0003. */
export const FINE_ART_ID = 'a7d1c1d0-5b0e-4a4e-9d57-0c0f1e000001';
export const RESIN_ID = 'a7d1c1d0-5b0e-4a4e-9d57-0c0f1e000002';

export const baseArtwork: ArtworkFields = {
  title: 'Blue Hour',
  title_da: null,
  description: 'Oil on canvas, evening light.',
  description_da: null,
  price_minor: null,
  currency: null,
  width_cm: null,
  height_cm: null,
  depth_cm: null,
  medium: null,
  medium_da: null,
  year: null,
  status: 'available',
  featured: false,
  category_id: FINE_ART_ID,
  size_class: 'medium',
};

/** Insert an artwork straight into the database, optionally with images. Returns its id. */
export async function insertArtwork(
  fields: Partial<ArtworkFields> & { slug?: string } = {},
  imageCount = 1,
): Promise<{ id: string; slug: string; imageIds: string[] }> {
  const id = uuid();
  const a = { ...baseArtwork, ...fields };
  const slug = fields.slug ?? `art-${id.slice(0, 8)}`;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO artworks (id, title, title_da, slug, description, description_da, price_minor, currency, width_cm,
       height_cm, depth_cm, medium, medium_da, year, status, featured, category_id, size_class, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?19)`,
  )
    .bind(id, a.title, a.title_da, slug, a.description, a.description_da, a.price_minor, a.currency, a.width_cm,
      a.height_cm, a.depth_cm, a.medium, a.medium_da, a.year, a.status, a.featured ? 1 : 0, a.category_id, a.size_class, now)
    .run();
  const imageIds: string[] = [];
  for (let i = 0; i < imageCount; i++) {
    const imageId = uuid();
    imageIds.push(imageId);
    await env.DB.prepare(
      `INSERT INTO artwork_images (id, artwork_id, object_key_base, alt_text, sort_order, width, height, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
    )
      .bind(imageId, id, `artworks/${id}/${imageId}`, `Image ${i + 1}`, i, 1920, 2400, now)
      .run();
  }
  return { id, slug, imageIds };
}
