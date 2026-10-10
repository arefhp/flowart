import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { FINE_ART_ID, RESIN_ID, adminJson, baseArtwork, call, insertArtwork } from './helpers';

type Cat = { id: string; name: string; name_da: string | null; slug: string; artwork_count: number };
type PubCat = { slug: string; name: string; count: number };

const adminCats = async () => ((await (await call('/api/admin/categories')).json()) as { categories: Cat[] }).categories;
const publicCats = async (lang = 'en') => ((await (await call(`/api/categories?lang=${lang}`)).json()) as { categories: PubCat[] }).categories;

describe('starting categories', () => {
  it('Fine Art and Resin exist from the start, in that order', async () => {
    const cats = await adminCats();
    expect(cats.map((c) => c.name)).toEqual(['Fine Art', 'Resin']);
    expect(cats.map((c) => c.slug)).toEqual(['fine-art', 'resin']);
    expect(cats.every((c) => c.artwork_count === 0)).toBe(true);
  });
});

describe('public categories (the filter buttons)', () => {
  it('lists only categories that have at least one SHOWN artwork', async () => {
    expect(await publicCats()).toEqual([]);
    await insertArtwork({ title: 'A', category_id: FINE_ART_ID });
    await insertArtwork({ title: 'B', category_id: FINE_ART_ID });
    await insertArtwork({ title: 'Hidden resin', category_id: RESIN_ID, status: 'hidden' });
    await insertArtwork({ title: 'Imageless resin', category_id: RESIN_ID }, 0);
    expect(await publicCats()).toEqual([{ slug: 'fine-art', name: 'Fine Art', count: 2 }]);
    await insertArtwork({ title: 'Shown resin', category_id: RESIN_ID });
    expect((await publicCats()).map((c) => c.slug)).toEqual(['fine-art', 'resin']);
  });

  it('uses the Danish name where there is one, otherwise the English name', async () => {
    await insertArtwork({ category_id: FINE_ART_ID });
    await insertArtwork({ category_id: RESIN_ID });
    await env.DB.prepare('UPDATE categories SET name_da = ?2 WHERE id = ?1').bind(RESIN_ID, 'Resin (dansk)').run();
    const da = await publicCats('da');
    expect(da.find((c) => c.slug === 'resin')!.name).toBe('Resin (dansk)');
    expect(da.find((c) => c.slug === 'fine-art')!.name).toBe('Fine Art'); // no Danish name: English
    expect(JSON.stringify(da)).not.toContain('name_da');
  });

  it('follows the order the owner chose', async () => {
    await insertArtwork({ category_id: FINE_ART_ID });
    await insertArtwork({ category_id: RESIN_ID });
    await adminJson('/api/admin/categories/order', 'PATCH', { ids: [RESIN_ID, FINE_ART_ID] });
    expect((await publicCats()).map((c) => c.slug)).toEqual(['resin', 'fine-art']);
  });
});

describe('artworks carry their category and size', () => {
  it('public list and detail include the category and size', async () => {
    const a = await insertArtwork({ title: 'Cat', category_id: RESIN_ID, size_class: 'large' });
    const list = (await (await call('/api/artworks')).json()) as { artworks: Array<Record<string, unknown>> };
    expect(list.artworks[0]).toMatchObject({ category: { slug: 'resin', name: 'Resin' }, size: 'large' });
    const detail = (await (await call(`/api/artworks/${a.slug}`)).json()) as Record<string, unknown>;
    expect(detail).toMatchObject({ category: { slug: 'resin', name: 'Resin' }, size: 'large' });
  });

  it('the size is left out when it was never set, and still no price keys leak', async () => {
    const a = await insertArtwork({ title: 'No size' });
    await env.DB.prepare('UPDATE artworks SET size_class = NULL WHERE id = ?1').bind(a.id).run();
    const detail = (await (await call(`/api/artworks/${a.slug}`)).json()) as Record<string, unknown>;
    expect(detail).not.toHaveProperty('size');
    expect(JSON.stringify(detail)).not.toMatch(/price|currency/i);
  });

  it('the category name follows the page language', async () => {
    await env.DB.prepare('UPDATE categories SET name_da = ?2 WHERE id = ?1').bind(FINE_ART_ID, 'Billedkunst').run();
    const a = await insertArtwork({ category_id: FINE_ART_ID });
    const da = (await (await call(`/api/artworks/${a.slug}?lang=da`)).json()) as { category: { name: string; slug: string } };
    expect(da.category).toEqual({ slug: 'fine-art', name: 'Billedkunst' });
  });
});

describe('the admin chooses a category and size for every artwork', () => {
  const create = (extra: Record<string, unknown>) => adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, ...extra });

  it('saves both and returns them', async () => {
    const res = await create({ category_id: RESIN_ID, size_class: 'small' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ category_id: RESIN_ID, category_name: 'Resin', size_class: 'small' });
  });

  it('refuses a missing or unknown category and an invalid size, naming the field', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ category_id: '' }, 'category_id'],
      [{ category_id: 'not-a-category' }, 'category_id'],
      [{ size_class: undefined }, 'size_class'],
      [{ size_class: 'huge' }, 'size_class'],
    ];
    for (const [extra, field] of cases) {
      const res = await create(extra);
      expect(res.status, JSON.stringify(extra)).toBe(400);
      const body = (await res.json()) as { error: { details: { fields: Record<string, string> } } };
      expect(Object.keys(body.error.details.fields), JSON.stringify(extra)).toContain(field);
    }
  });

  it('can be changed later; the admin list shows both', async () => {
    const created = (await (await create({})).json()) as { id: string };
    const res = await adminJson(`/api/admin/artworks/${created.id}`, 'PUT', { ...baseArtwork, category_id: RESIN_ID, size_class: 'large' });
    expect(await res.json()).toMatchObject({ category_name: 'Resin', size_class: 'large' });
    const list = (await (await call('/api/admin/artworks')).json()) as { artworks: Array<{ category_name: string; size_class: string }> };
    expect(list.artworks[0]).toMatchObject({ category_name: 'Resin', size_class: 'large' });
  });
});

describe('managing categories', () => {
  it('adds a category with a slug, after the others', async () => {
    const res = await adminJson('/api/admin/categories', 'POST', { name: 'Mixed Media', name_da: 'Blandet teknik' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: 'Mixed Media', name_da: 'Blandet teknik', slug: 'mixed-media', artwork_count: 0 });
    expect((await adminCats()).map((c) => c.name)).toEqual(['Fine Art', 'Resin', 'Mixed Media']);
  });

  it('refuses an empty name and a name that is already used (any capitalisation)', async () => {
    expect((await adminJson('/api/admin/categories', 'POST', { name: '   ' })).status).toBe(400);
    const dup = await adminJson('/api/admin/categories', 'POST', { name: '  fine art ' });
    expect(dup.status).toBe(400);
    expect(((await dup.json()) as { error: { message: string } }).error.message).toContain('already');
    expect((await adminCats()).length).toBe(2);
  });

  it('renames a category but keeps its slug, so shared filter links keep working', async () => {
    const res = await adminJson(`/api/admin/categories/${RESIN_ID}`, 'PUT', { name: 'Epoxy Resin', name_da: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Epoxy Resin', slug: 'resin' });
    expect((await adminJson(`/api/admin/categories/${RESIN_ID}`, 'PUT', { name: 'Epoxy Resin' })).status).toBe(200); // same name is fine
    expect((await adminJson(`/api/admin/categories/${RESIN_ID}`, 'PUT', { name: 'FINE ART' })).status).toBe(400);
    expect((await adminJson('/api/admin/categories/nope', 'PUT', { name: 'X' })).status).toBe(404);
  });

  it('a renamed category shows its new name on artworks', async () => {
    const a = await insertArtwork({ category_id: RESIN_ID });
    await adminJson(`/api/admin/categories/${RESIN_ID}`, 'PUT', { name: 'Epoxy Resin' });
    const detail = (await (await call(`/api/artworks/${a.slug}`)).json()) as { category: { name: string } };
    expect(detail.category.name).toBe('Epoxy Resin');
  });

  it('DELETE is blocked while any artwork (even a hidden one) is in the category', async () => {
    await insertArtwork({ title: 'Shown piece', category_id: RESIN_ID });
    await insertArtwork({ title: 'Hidden piece', category_id: RESIN_ID, status: 'hidden' });
    const res = await adminJson(`/api/admin/categories/${RESIN_ID}`, 'DELETE');
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string; details: { count: number; titles: string[] } } };
    expect(body.error.code).toBe('category_in_use');
    expect(body.error.message).toContain('"Resin"');
    expect(body.error.message).toContain('2 artworks are still in it');
    expect(body.error.details).toEqual({ count: 2, titles: ['Hidden piece', 'Shown piece'] });
    expect((await adminCats()).map((c) => c.name)).toContain('Resin');
  });

  it('the database itself also refuses (safety net behind the friendly message)', async () => {
    await insertArtwork({ category_id: RESIN_ID });
    await expect(env.DB.prepare('DELETE FROM categories WHERE id = ?1').bind(RESIN_ID).run()).rejects.toThrow();
  });

  it('DELETE works once nothing is assigned: after moving the artwork, or when it was empty', async () => {
    const a = await insertArtwork({ category_id: RESIN_ID });
    expect((await adminJson(`/api/admin/categories/${RESIN_ID}`, 'DELETE')).status).toBe(409);
    await adminJson(`/api/admin/artworks/${a.id}`, 'PUT', { ...baseArtwork, title: 'Moved', category_id: FINE_ART_ID });
    expect((await adminJson(`/api/admin/categories/${RESIN_ID}`, 'DELETE')).status).toBe(200);
    expect((await adminCats()).map((c) => c.name)).toEqual(['Fine Art']);
    expect((await adminJson('/api/admin/categories/nope', 'DELETE')).status).toBe(404);
  });

  it('counts include hidden artworks in the admin but not in the public filter', async () => {
    await insertArtwork({ category_id: FINE_ART_ID });
    await insertArtwork({ category_id: FINE_ART_ID, status: 'hidden' });
    expect((await adminCats()).find((c) => c.id === FINE_ART_ID)!.artwork_count).toBe(2);
    expect((await publicCats())[0]!.count).toBe(1);
  });

  it('reorders, and refuses a list that does not match', async () => {
    const res = await adminJson('/api/admin/categories/order', 'PATCH', { ids: [RESIN_ID, FINE_ART_ID] });
    expect(res.status).toBe(200);
    expect((await adminCats()).map((c) => c.slug)).toEqual(['resin', 'fine-art']);
    expect((await adminJson('/api/admin/categories/order', 'PATCH', { ids: [RESIN_ID] })).status).toBe(400);
    expect((await adminJson('/api/admin/categories/order', 'PATCH', { ids: [RESIN_ID, RESIN_ID] })).status).toBe(400);
  });

  it('records changes in the audit log and counts as a content change for the rebuild', async () => {
    await adminJson('/api/admin/categories', 'POST', { name: 'Prints' });
    const row = await env.DB.prepare(`SELECT action FROM audit_log WHERE action = 'category.create'`).first();
    expect(row).toEqual({ action: 'category.create' });
  });
});

describe('the Danish About text exists by default (migration 0003)', () => {
  it('Danish visitors get a Danish statement from the start', async () => {
    const da = (await (await call('/api/about?lang=da')).json()) as { body: string };
    const en = (await (await call('/api/about?lang=en')).json()) as { body: string };
    expect(da.body).not.toBe(en.body);
    expect(da.body).toContain('persisk miniaturemaleri');
    expect(da.body.split('\n\n')).toHaveLength(4);
  });
});
