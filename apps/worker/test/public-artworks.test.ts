import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { baseArtwork, call, insertArtwork } from './helpers';

type ListResponse = { artworks: Array<Record<string, unknown>> };

describe('CRITICAL RULE: optional price (spec section 4)', () => {
  it('omits price_minor and currency entirely when the price is NULL (list and detail)', async () => {
    const { slug } = await insertArtwork({ title: 'Quiet morning', price_minor: null, currency: null });

    const list = await call('/api/artworks');
    const body = (await list.json()) as ListResponse;
    expect(body.artworks).toHaveLength(1);
    expect(Object.keys(body.artworks[0]!)).not.toContain('price_minor');
    expect(Object.keys(body.artworks[0]!)).not.toContain('currency');

    const detail = await call(`/api/artworks/${slug}`);
    const raw = await detail.text();
    expect(raw).not.toMatch(/price/i);
    expect(raw).not.toMatch(/currency/i);
  });

  it('includes the price when one is set, and treats 0 as a real price', async () => {
    const a = await insertArtwork({ title: 'Priced', price_minor: 120000, currency: 'DKK' });
    const b = await insertArtwork({ title: 'Free', price_minor: 0, currency: 'DKK' });
    const detailA = (await (await call(`/api/artworks/${a.slug}`)).json()) as Record<string, unknown>;
    const detailB = (await (await call(`/api/artworks/${b.slug}`)).json()) as Record<string, unknown>;
    expect(detailA.price_minor).toBe(120000);
    expect(detailA.currency).toBe('DKK');
    expect(detailB.price_minor).toBe(0);
  });
});

describe('public artworks', () => {
  it('never returns hidden artworks', async () => {
    const hidden = await insertArtwork({ title: 'Secret', status: 'hidden' });
    await insertArtwork({ title: 'Shown', status: 'available' });
    const list = (await (await call('/api/artworks')).json()) as ListResponse;
    expect(list.artworks.map((a) => a.title)).toEqual(['Shown']);
    expect((await call(`/api/artworks/${hidden.slug}`)).status).toBe(404);
  });

  it('shows available, reserved and sold', async () => {
    await insertArtwork({ title: 'A', status: 'available' });
    await insertArtwork({ title: 'B', status: 'reserved' });
    await insertArtwork({ title: 'C', status: 'sold' });
    const list = (await (await call('/api/artworks')).json()) as ListResponse;
    expect(list.artworks.map((a) => a.status).sort()).toEqual(['available', 'reserved', 'sold']);
  });

  it('does not show an artwork that has no images (no empty frame)', async () => {
    const noImg = await insertArtwork({ title: 'Imageless' }, 0);
    const list = (await (await call('/api/artworks')).json()) as ListResponse;
    expect(list.artworks).toHaveLength(0);
    expect((await call(`/api/artworks/${noImg.slug}`)).status).toBe(404);
  });

  it('list items carry only the card fields: one cover, no description, no ids', async () => {
    await insertArtwork({ title: 'Card', description: 'Long text', medium: 'Oil' }, 3);
    const list = (await (await call('/api/artworks')).json()) as ListResponse;
    const item = list.artworks[0]!;
    expect(Object.keys(item).sort()).toEqual(['cover', 'medium', 'slug', 'status', 'title']);
    expect(Object.keys(item.cover as object).sort()).toEqual(['alt', 'height', 'url', 'width']);
  });

  it('uses the chosen cover, otherwise the first image', async () => {
    const { id, slug, imageIds } = await insertArtwork({ title: 'Cover' }, 3);
    let list = (await (await call('/api/artworks')).json()) as ListResponse;
    expect((list.artworks[0]!.cover as { alt: string }).alt).toBe('Image 1');

    await env.DB.prepare('UPDATE artworks SET cover_image_id = ?2 WHERE id = ?1').bind(id, imageIds[2]).run();
    list = (await (await call('/api/artworks')).json()) as ListResponse;
    expect((list.artworks[0]!.cover as { alt: string }).alt).toBe('Image 3');

    const detail = (await (await call(`/api/artworks/${slug}`)).json()) as { images: Array<{ alt: string }> };
    // the cover comes first, then the rest in order
    expect(detail.images.map((i) => i.alt)).toEqual(['Image 3', 'Image 1', 'Image 2']);
  });

  it('shows only the dimensions that exist, and no dimensions key when there are none', async () => {
    const none = await insertArtwork({ title: 'None' });
    const some = await insertArtwork({ title: 'Some', width_cm: 50, height_cm: 70 });
    const dNone = (await (await call(`/api/artworks/${none.slug}`)).json()) as Record<string, unknown>;
    const dSome = (await (await call(`/api/artworks/${some.slug}`)).json()) as { dimensions: Record<string, number> };
    expect(dNone).not.toHaveProperty('dimensions');
    expect(dSome.dimensions).toEqual({ width_cm: 50, height_cm: 70 });
  });

  it('omits optional text and year when they are empty', async () => {
    const a = await insertArtwork({ title: 'Bare', description: null, medium: null, year: null });
    const d = (await (await call(`/api/artworks/${a.slug}`)).json()) as Record<string, unknown>;
    expect(d).not.toHaveProperty('description');
    expect(d).not.toHaveProperty('medium');
    expect(d).not.toHaveProperty('year');
  });

  it('filters featured artworks', async () => {
    await insertArtwork({ title: 'Plain' });
    await insertArtwork({ title: 'Star', featured: true });
    const list = (await (await call('/api/artworks?featured=1')).json()) as ListResponse;
    expect(list.artworks.map((a) => a.title)).toEqual(['Star']);
  });

  it('builds image URLs from MEDIA_BASE_URL', async () => {
    const a = await insertArtwork({ title: 'Url' });
    const d = (await (await call(`/api/artworks/${a.slug}`)).json()) as { images: Array<{ url: string }> };
    expect(d.images[0]!.url).toMatch(/^http:\/\/localhost:8787\/media\/artworks\/.+/);
    expect(d.images[0]!.url).not.toMatch(/\.webp$/); // the client adds -480/-960/-1920
  });

  it('falls back to the title when an image has no alt text', async () => {
    const a = await insertArtwork({ title: 'Titled' });
    await env.DB.prepare(`UPDATE artwork_images SET alt_text = '' WHERE artwork_id = ?1`).bind(a.id).run();
    const d = (await (await call(`/api/artworks/${a.slug}`)).json()) as { images: Array<{ alt: string }> };
    expect(d.images[0]!.alt).toBe('Titled');
  });

  it('sends a public cache header', async () => {
    const res = await call('/api/artworks');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });
});

describe('languages (Danish falls back to English per field)', () => {
  it('serves Danish where it exists and English where it does not', async () => {
    const a = await insertArtwork({
      title: 'Blue Hour',
      title_da: 'Den blå time',
      description: 'English text',
      description_da: null, // missing Danish
      medium: 'Oil on canvas',
      medium_da: 'Olie på lærred',
    });
    const da = (await (await call(`/api/artworks/${a.slug}?lang=da`)).json()) as Record<string, string>;
    expect(da.title).toBe('Den blå time');
    expect(da.description).toBe('English text');
    expect(da.medium).toBe('Olie på lærred');
    const en = (await (await call(`/api/artworks/${a.slug}?lang=en`)).json()) as Record<string, string>;
    expect(en.title).toBe('Blue Hour');
  });

  it('never leaks *_da keys and defaults to English', async () => {
    const a = await insertArtwork({ title: 'Only English' });
    const raw = await (await call(`/api/artworks/${a.slug}`)).text();
    expect(raw).not.toContain('_da');
    expect(JSON.parse(raw).title).toBe('Only English');
  });

  it('ignores an unknown language', async () => {
    const a = await insertArtwork({ title: 'X', title_da: 'Y' });
    const d = (await (await call(`/api/artworks/${a.slug}?lang=fr`)).json()) as { title: string };
    expect(d.title).toBe('X');
  });
});

it('baseArtwork sanity: defaults are valid', () => {
  expect(baseArtwork.status).toBe('available');
});
