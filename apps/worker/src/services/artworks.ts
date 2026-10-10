import {
  IMAGE_WIDTHS,
  LIMITS,
  PUBLIC_ARTWORK_STATUSES,
  pickText,
  slugify,
  type ArtworkStatus,
  type Locale,
} from '@flowart/shared';
import type { Env } from '../env';
import { HttpError, notFound, nowIso, uuid } from '../lib/http';
import type { ArtworkInput } from '../schemas';
import { deleteVariants, putVariants, type ValidatedUpload } from './images';

export interface ArtworkRow {
  id: string;
  title: string;
  title_da: string | null;
  slug: string;
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
  status: ArtworkStatus;
  featured: number;
  cover_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageRow {
  id: string;
  artwork_id: string;
  object_key_base: string;
  alt_text: string;
  alt_text_da: string | null;
  sort_order: number;
  width: number;
  height: number;
  created_at: string;
}

export function mediaUrl(env: Env, base: string): string {
  return `${env.MEDIA_BASE_URL.replace(/\/+$/, '')}/${base}`;
}

/** The cover is the chosen image, or the first image when none is chosen. */
export function pickCover(row: ArtworkRow, images: ImageRow[]): ImageRow | undefined {
  return images.find((i) => i.id === row.cover_image_id) ?? images[0];
}

// ---------------------------------------------------------------------------
// Public DTOs. Built explicitly: a database row is NEVER spread into a response.
// `price_minor` / `currency` appear ONLY when a price is set (spec 4, critical rule).
// ---------------------------------------------------------------------------

export interface PublicImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface PublicArtworkListItem {
  slug: string;
  title: string;
  status: ArtworkStatus;
  medium?: string;
  cover: PublicImage;
  price_minor?: number;
  currency?: string;
}

export interface PublicArtworkDetail {
  slug: string;
  title: string;
  status: ArtworkStatus;
  description?: string;
  medium?: string;
  year?: number;
  dimensions?: { width_cm?: number; height_cm?: number; depth_cm?: number };
  images: PublicImage[];
  price_minor?: number;
  currency?: string;
}

function publicImage(env: Env, lang: Locale, row: ArtworkRow, img: ImageRow): PublicImage {
  const alt = (pickText(lang, img.alt_text, img.alt_text_da) as string).trim();
  return {
    url: mediaUrl(env, img.object_key_base),
    // an image without alt text falls back to the artwork title rather than an empty alt
    alt: alt || (pickText(lang, row.title, row.title_da) as string),
    width: img.width,
    height: img.height,
  };
}

function withPrice<T extends object>(dto: T, row: ArtworkRow): T & { price_minor?: number; currency?: string } {
  if (row.price_minor === null || row.currency === null) return dto;
  return { ...dto, price_minor: row.price_minor, currency: row.currency };
}

async function imagesFor(env: Env, artworkIds: string[]): Promise<Map<string, ImageRow[]>> {
  const map = new Map<string, ImageRow[]>();
  if (artworkIds.length === 0) return map;
  const placeholders = artworkIds.map((_, i) => `?${i + 1}`).join(',');
  const rows = await env.DB.prepare(
    `SELECT * FROM artwork_images WHERE artwork_id IN (${placeholders}) ORDER BY artwork_id, sort_order, created_at`,
  )
    .bind(...artworkIds)
    .all<ImageRow>();
  for (const r of rows.results) {
    const list = map.get(r.artwork_id) ?? [];
    list.push(r);
    map.set(r.artwork_id, list);
  }
  return map;
}

const PUBLIC_STATUS_SQL = PUBLIC_ARTWORK_STATUSES.map((s) => `'${s}'`).join(',');

export async function listPublicArtworks(
  env: Env,
  lang: Locale,
  opts: { featured?: boolean } = {},
): Promise<PublicArtworkListItem[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM artworks WHERE status IN (${PUBLIC_STATUS_SQL}) ${opts.featured ? 'AND featured = 1' : ''}
     ORDER BY created_at DESC, id`,
  ).all<ArtworkRow>();
  const images = await imagesFor(
    env,
    rows.results.map((r) => r.id),
  );
  const out: PublicArtworkListItem[] = [];
  for (const row of rows.results) {
    const imgs = images.get(row.id) ?? [];
    const cover = pickCover(row, imgs);
    // An artwork without images is not shown publicly (no empty frame or placeholder).
    if (!cover) continue;
    const medium = (pickText(lang, row.medium, row.medium_da) ?? '') as string;
    const dto: PublicArtworkListItem = {
      slug: row.slug,
      title: pickText(lang, row.title, row.title_da) as string,
      status: row.status,
      ...(medium ? { medium } : {}),
      cover: publicImage(env, lang, row, cover),
    };
    out.push(withPrice(dto, row));
  }
  return out;
}

export async function getPublicArtwork(env: Env, slug: string, lang: Locale): Promise<PublicArtworkDetail> {
  const row = await env.DB.prepare(`SELECT * FROM artworks WHERE slug = ?1 AND status IN (${PUBLIC_STATUS_SQL})`)
    .bind(slug)
    .first<ArtworkRow>();
  if (!row) throw notFound('Artwork not found');
  const imgs = (await imagesFor(env, [row.id])).get(row.id) ?? [];
  const cover = pickCover(row, imgs);
  if (!cover) throw notFound('Artwork not found');
  // cover first, then the rest in sort order
  const ordered = [cover, ...imgs.filter((i) => i.id !== cover.id)];

  const description = (pickText(lang, row.description, row.description_da) ?? '') as string;
  const medium = (pickText(lang, row.medium, row.medium_da) ?? '') as string;
  const dimensions: NonNullable<PublicArtworkDetail['dimensions']> = {};
  if (row.width_cm !== null) dimensions.width_cm = row.width_cm;
  if (row.height_cm !== null) dimensions.height_cm = row.height_cm;
  if (row.depth_cm !== null) dimensions.depth_cm = row.depth_cm;

  const dto: PublicArtworkDetail = {
    slug: row.slug,
    title: pickText(lang, row.title, row.title_da) as string,
    status: row.status,
    ...(description ? { description } : {}),
    ...(medium ? { medium } : {}),
    ...(row.year !== null ? { year: row.year } : {}),
    ...(Object.keys(dimensions).length ? { dimensions } : {}),
    images: ordered.map((i) => publicImage(env, lang, row, i)),
  };
  return withPrice(dto, row);
}

/** Lightweight lookup used by the contact form's "ask about this work". */
export async function findPublicArtworkBySlug(
  env: Env,
  slug: string,
): Promise<{ id: string; title: string } | null> {
  return env.DB.prepare(`SELECT id, title FROM artworks WHERE slug = ?1 AND status IN ('available', 'reserved')`)
    .bind(slug)
    .first<{ id: string; title: string }>();
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminImage {
  id: string;
  url: string;
  alt_text: string;
  alt_text_da: string | null;
  sort_order: number;
  width: number;
  height: number;
  is_cover: boolean;
}

export function adminArtworkDto(env: Env, row: ArtworkRow, images: ImageRow[]) {
  const cover = pickCover(row, images);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    title_da: row.title_da,
    description: row.description,
    description_da: row.description_da,
    price_minor: row.price_minor,
    currency: row.currency,
    width_cm: row.width_cm,
    height_cm: row.height_cm,
    depth_cm: row.depth_cm,
    medium: row.medium,
    medium_da: row.medium_da,
    year: row.year,
    status: row.status,
    featured: row.featured === 1,
    cover_image_id: cover?.id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    images: images.map<AdminImage>((i) => ({
      id: i.id,
      url: mediaUrl(env, i.object_key_base),
      alt_text: i.alt_text,
      alt_text_da: i.alt_text_da,
      sort_order: i.sort_order,
      width: i.width,
      height: i.height,
      is_cover: i.id === cover?.id,
    })),
  };
}

export async function listAdminArtworks(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM artworks ORDER BY created_at DESC, id').all<ArtworkRow>();
  const images = await imagesFor(
    env,
    rows.results.map((r) => r.id),
  );
  return rows.results.map((row) => {
    const imgs = images.get(row.id) ?? [];
    const cover = pickCover(row, imgs);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      featured: row.featured === 1,
      price_minor: row.price_minor,
      currency: row.currency,
      image_count: imgs.length,
      cover: cover
        ? { url: mediaUrl(env, cover.object_key_base), width: cover.width, height: cover.height }
        : null,
      updated_at: row.updated_at,
    };
  });
}

async function getRow(env: Env, id: string): Promise<ArtworkRow> {
  const row = await env.DB.prepare('SELECT * FROM artworks WHERE id = ?1').bind(id).first<ArtworkRow>();
  if (!row) throw notFound('Artwork not found');
  return row;
}

export async function getAdminArtwork(env: Env, id: string) {
  const row = await getRow(env, id);
  const imgs = (await imagesFor(env, [id])).get(id) ?? [];
  return adminArtworkDto(env, row, imgs);
}

async function uniqueSlug(env: Env, title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await env.DB.prepare('SELECT 1 AS x FROM artworks WHERE slug = ?1').bind(candidate).first();
    if (!taken) return candidate;
  }
  return `${base}-${uuid().slice(0, 8)}`;
}

export async function createArtwork(env: Env, input: ArtworkInput) {
  const id = uuid();
  const now = nowIso();
  const slug = await uniqueSlug(env, input.title);
  await env.DB.prepare(
    `INSERT INTO artworks (id, title, title_da, slug, description, description_da, price_minor, currency,
       width_cm, height_cm, depth_cm, medium, medium_da, year, status, featured, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)`,
  )
    .bind(
      id,
      input.title,
      input.title_da,
      slug,
      input.description,
      input.description_da,
      input.price_minor,
      input.currency,
      input.width_cm,
      input.height_cm,
      input.depth_cm,
      input.medium,
      input.medium_da,
      input.year,
      input.status,
      input.featured ? 1 : 0,
      now,
    )
    .run();
  return getAdminArtwork(env, id);
}

export async function updateArtwork(env: Env, id: string, input: ArtworkInput) {
  await getRow(env, id);
  await env.DB.prepare(
    `UPDATE artworks SET title=?2, title_da=?3, description=?4, description_da=?5, price_minor=?6, currency=?7,
       width_cm=?8, height_cm=?9, depth_cm=?10, medium=?11, medium_da=?12, year=?13, status=?14, featured=?15
     WHERE id=?1`,
  )
    .bind(
      id,
      input.title,
      input.title_da,
      input.description,
      input.description_da,
      input.price_minor,
      input.currency,
      input.width_cm,
      input.height_cm,
      input.depth_cm,
      input.medium,
      input.medium_da,
      input.year,
      input.status,
      input.featured ? 1 : 0,
    )
    .run();
  return getAdminArtwork(env, id);
}

export async function deleteArtwork(env: Env, actor: string, id: string): Promise<void> {
  await getRow(env, id);
  const imgs = (await imagesFor(env, [id])).get(id) ?? [];
  await env.DB.prepare('DELETE FROM artworks WHERE id = ?1').bind(id).run(); // images cascade
  for (const img of imgs) await deleteVariants(env, actor, img.object_key_base);
}

export async function addImage(
  env: Env,
  artworkId: string,
  upload: ValidatedUpload,
  alt: { alt_text: string; alt_text_da: string | null },
) {
  await getRow(env, artworkId);
  const existing = (await imagesFor(env, [artworkId])).get(artworkId) ?? [];
  if (existing.length >= LIMITS.imagesPerArtworkMax) {
    throw new HttpError(400, 'too_many_images', `An artwork can have at most ${LIMITS.imagesPerArtworkMax} images.`);
  }
  const id = uuid();
  const base = `artworks/${artworkId}/${uuid()}`;
  await putVariants(env.MEDIA, base, upload);
  const sort = existing.length ? Math.max(...existing.map((i) => i.sort_order)) + 1 : 0;
  try {
    await env.DB.prepare(
      `INSERT INTO artwork_images (id, artwork_id, object_key_base, alt_text, alt_text_da, sort_order, width, height, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    )
      .bind(id, artworkId, base, alt.alt_text, alt.alt_text_da, sort, upload.width, upload.height, nowIso())
      .run();
  } catch (err) {
    await env.MEDIA.delete(IMAGE_KEYS(base)).catch(() => undefined);
    throw err;
  }
  return getAdminArtwork(env, artworkId);
}

const IMAGE_KEYS = (base: string) => IMAGE_WIDTHS.map((w) => `${base}-${w}.webp`);

async function getImage(env: Env, artworkId: string, imageId: string): Promise<ImageRow> {
  const img = await env.DB.prepare('SELECT * FROM artwork_images WHERE id = ?1 AND artwork_id = ?2')
    .bind(imageId, artworkId)
    .first<ImageRow>();
  if (!img) throw notFound('Image not found');
  return img;
}

export async function updateImageAlt(
  env: Env,
  artworkId: string,
  imageId: string,
  alt: { alt_text: string; alt_text_da: string | null },
) {
  await getImage(env, artworkId, imageId);
  await env.DB.prepare('UPDATE artwork_images SET alt_text = ?2, alt_text_da = ?3 WHERE id = ?1')
    .bind(imageId, alt.alt_text, alt.alt_text_da)
    .run();
  await env.DB.prepare('UPDATE artworks SET updated_at = ?2 WHERE id = ?1').bind(artworkId, nowIso()).run();
  return getAdminArtwork(env, artworkId);
}

export async function deleteImage(env: Env, actor: string, artworkId: string, imageId: string) {
  const img = await getImage(env, artworkId, imageId);
  await env.DB.prepare('DELETE FROM artwork_images WHERE id = ?1').bind(imageId).run(); // cover FK -> NULL
  await env.DB.prepare('UPDATE artworks SET updated_at = ?2 WHERE id = ?1').bind(artworkId, nowIso()).run();
  await deleteVariants(env, actor, img.object_key_base);
  return getAdminArtwork(env, artworkId);
}

export async function reorderImages(env: Env, artworkId: string, ids: string[]) {
  const imgs = (await imagesFor(env, [artworkId])).get(artworkId) ?? [];
  const current = new Set(imgs.map((i) => i.id));
  if (ids.length !== current.size || !ids.every((id) => current.has(id)) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'invalid_order', 'The image list does not match the artwork’s images.');
  }
  await env.DB.batch(
    ids.map((id, index) => env.DB.prepare('UPDATE artwork_images SET sort_order = ?2 WHERE id = ?1').bind(id, index)),
  );
  await env.DB.prepare('UPDATE artworks SET updated_at = ?2 WHERE id = ?1').bind(artworkId, nowIso()).run();
  return getAdminArtwork(env, artworkId);
}

export async function setCover(env: Env, artworkId: string, imageId: string | null) {
  await getRow(env, artworkId);
  if (imageId !== null) await getImage(env, artworkId, imageId);
  await env.DB.prepare('UPDATE artworks SET cover_image_id = ?2 WHERE id = ?1').bind(artworkId, imageId).run();
  return getAdminArtwork(env, artworkId);
}
