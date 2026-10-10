import { PUBLIC_ARTWORK_STATUSES, pickText, slugify, type Locale } from '@flowart/shared';
import type { Env } from '../env';
import { HttpError, notFound, nowIso, uuid } from '../lib/http';

interface CategoryRow {
  id: string;
  name: string;
  name_da: string | null;
  slug: string;
  sort_order: number;
}

const PUBLIC_STATUS_SQL = PUBLIC_ARTWORK_STATUSES.map((s) => `'${s}'`).join(',');

export interface PublicCategory {
  slug: string;
  name: string;
  count: number;
}

/**
 * Categories visitors can filter by: only those with at least one artwork that is actually shown
 * (not hidden, has an image), so there is never an empty filter button.
 */
export async function listPublicCategories(env: Env, lang: Locale): Promise<PublicCategory[]> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.name, c.name_da, c.slug, c.sort_order, COUNT(a.id) AS n
       FROM categories c
       JOIN artworks a ON a.category_id = c.id AND a.status IN (${PUBLIC_STATUS_SQL})
            AND EXISTS (SELECT 1 FROM artwork_images i WHERE i.artwork_id = a.id)
      GROUP BY c.id ORDER BY c.sort_order, c.name`,
  ).all<CategoryRow & { n: number }>();
  return rows.results.map((r) => ({ slug: r.slug, name: pickText(lang, r.name, r.name_da) as string, count: r.n }));
}

export interface AdminCategory {
  id: string;
  name: string;
  name_da: string | null;
  slug: string;
  artwork_count: number;
}

export async function listAdminCategories(env: Env): Promise<AdminCategory[]> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.name, c.name_da, c.slug, COUNT(a.id) AS n
       FROM categories c LEFT JOIN artworks a ON a.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order, c.name`,
  ).all<CategoryRow & { n: number }>();
  return rows.results.map((r) => ({ id: r.id, name: r.name, name_da: r.name_da, slug: r.slug, artwork_count: r.n }));
}

async function getRow(env: Env, id: string): Promise<CategoryRow> {
  const row = await env.DB.prepare('SELECT id, name, name_da, slug, sort_order FROM categories WHERE id = ?1')
    .bind(id)
    .first<CategoryRow>();
  if (!row) throw notFound('Category not found');
  return row;
}

async function assertNameFree(env: Env, name: string, exceptId?: string): Promise<void> {
  const clash = await env.DB.prepare('SELECT id FROM categories WHERE lower(trim(name)) = lower(trim(?1)) AND id <> ?2')
    .bind(name, exceptId ?? '')
    .first();
  if (clash) {
    throw new HttpError(400, 'validation_error', `There is already a category called "${name}".`, {
      fields: { name: 'This name is already used by another category.' },
    });
  }
}

async function uniqueSlug(env: Env, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await env.DB.prepare('SELECT 1 AS x FROM categories WHERE slug = ?1').bind(candidate).first();
    if (!taken) return candidate;
  }
  return `${base}-${uuid().slice(0, 8)}`;
}

export async function createCategory(env: Env, input: { name: string; name_da: string | null }) {
  await assertNameFree(env, input.name);
  const id = uuid();
  const now = nowIso();
  const last = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').first<{ m: number }>();
  await env.DB.prepare(
    'INSERT INTO categories (id, name, name_da, slug, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)',
  )
    .bind(id, input.name, input.name_da, await uniqueSlug(env, input.name), (last?.m ?? 0) + 1, now)
    .run();
  return (await listAdminCategories(env)).find((c) => c.id === id)!;
}

/** Rename. The slug (used in filter links) stays the same so shared links keep working. */
export async function updateCategory(env: Env, id: string, input: { name: string; name_da: string | null }) {
  await getRow(env, id);
  await assertNameFree(env, input.name, id);
  await env.DB.prepare('UPDATE categories SET name = ?2, name_da = ?3 WHERE id = ?1').bind(id, input.name, input.name_da).run();
  return (await listAdminCategories(env)).find((c) => c.id === id)!;
}

/** A category that still has artworks cannot be deleted: the owner must move them first. */
export async function deleteCategory(env: Env, id: string): Promise<void> {
  const row = await getRow(env, id);
  const used = await env.DB.prepare('SELECT title FROM artworks WHERE category_id = ?1 ORDER BY title').bind(id).all<{ title: string }>();
  if (used.results.length > 0) {
    const titles = used.results.map((r) => r.title);
    const n = titles.length;
    throw new HttpError(
      409,
      'category_in_use',
      `"${row.name}" cannot be deleted: ${n} artwork${n === 1 ? ' is' : 's are'} still in it. Move ${n === 1 ? 'it' : 'them'} to another category first.`,
      { count: n, titles: titles.slice(0, 8) },
    );
  }
  await env.DB.prepare('DELETE FROM categories WHERE id = ?1').bind(id).run();
}

export async function reorderCategories(env: Env, ids: string[]) {
  const rows = await env.DB.prepare('SELECT id FROM categories').all<{ id: string }>();
  const current = new Set(rows.results.map((r) => r.id));
  if (ids.length !== current.size || !ids.every((i) => current.has(i)) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'invalid_order', 'The category list does not match the existing categories.');
  }
  await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE categories SET sort_order = ?2 WHERE id = ?1').bind(id, i + 1)));
  return listAdminCategories(env);
}

export async function categoryExists(env: Env, id: string): Promise<boolean> {
  return Boolean(await env.DB.prepare('SELECT 1 AS x FROM categories WHERE id = ?1').bind(id).first());
}
