import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { adminJson, adminUpload, baseArtwork, call, makeWebp, uploadForm } from './helpers';

type Art = {
  id: string;
  slug: string;
  title: string;
  price_minor: number | null;
  currency: string | null;
  cover_image_id: string | null;
  images: Array<{ id: string; url: string; is_cover: boolean; alt_text: string; alt_text_da: string | null; sort_order: number }>;
};

async function createArt(fields: Record<string, unknown> = {}): Promise<Art> {
  const res = await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, ...fields });
  expect(res.status).toBe(201);
  return (await res.json()) as Art;
}

async function upload(id: string, opts: Parameters<typeof uploadForm>[0] = {}): Promise<Art> {
  const res = await adminUpload(`/api/admin/artworks/${id}/images`, uploadForm(opts));
  expect(res.status).toBe(201);
  return (await res.json()) as Art;
}

const keysOf = (url: string) => [480, 960, 1920].map((w) => `${new URL(url).pathname.replace('/media/', '')}-${w}.webp`);

describe('artwork CRUD', () => {
  it('creates an artwork with a slug made from the English title', async () => {
    const art = await createArt({ title: 'Røde blomster' });
    expect(art.slug).toBe('rode-blomster');
    expect(art.price_minor).toBeNull();
  });

  it('gives duplicate titles unique slugs', async () => {
    const a = await createArt({ title: 'Same' });
    const b = await createArt({ title: 'Same' });
    expect(a.slug).toBe('same');
    expect(b.slug).toBe('same-2');
  });

  it('an empty price saves NULL (not 0) and drops the currency', async () => {
    const art = await createArt({ price_minor: null, currency: 'DKK' });
    expect(art.price_minor).toBeNull();
    expect(art.currency).toBeNull();
    const row = await env.DB.prepare('SELECT price_minor, currency FROM artworks WHERE id = ?1').bind(art.id).first();
    expect(row).toEqual({ price_minor: null, currency: null });
  });

  it('a price needs a currency', async () => {
    const res = await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, price_minor: 5000, currency: null });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: { fields: Record<string, string> } } };
    expect(body.error.details.fields.currency).toBeTruthy();
  });

  it('0 is accepted as a genuine price', async () => {
    const art = await createArt({ price_minor: 0, currency: 'DKK' });
    expect(art.price_minor).toBe(0);
  });

  it('rejects an empty English title and negative or silly numbers', async () => {
    expect((await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, title: '   ' })).status).toBe(400);
    expect((await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, price_minor: -1, currency: 'DKK' })).status).toBe(400);
    expect((await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, width_cm: -4 })).status).toBe(400);
    expect((await adminJson('/api/admin/artworks', 'POST', { ...baseArtwork, status: 'bogus' })).status).toBe(400);
  });

  it('updates, including Danish text, and keeps the slug', async () => {
    const art = await createArt({ title: 'Original' });
    const res = await adminJson(`/api/admin/artworks/${art.id}`, 'PUT', {
      ...baseArtwork,
      title: 'Renamed',
      title_da: 'Omdøbt',
      price_minor: 25000,
      currency: 'DKK',
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as Art & { title_da: string };
    expect(updated.slug).toBe('original');
    expect(updated.title_da).toBe('Omdøbt');
    expect(updated.price_minor).toBe(25000);
  });

  it('returns 404 for an unknown artwork and rejects malformed JSON', async () => {
    expect((await adminJson('/api/admin/artworks/nope', 'PUT', baseArtwork)).status).toBe(404);
    const bad = await call('/api/admin/artworks', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'X-Admin-Request': '1' },
      body: '{not json',
    });
    expect(bad.status).toBe(400);
  });

  it('lists artworks for the admin including hidden ones and image counts', async () => {
    const art = await createArt({ title: 'Draft', status: 'hidden' });
    await upload(art.id);
    const res = await call('/api/admin/artworks');
    const body = (await res.json()) as { artworks: Array<{ title: string; image_count: number; cover: unknown }> };
    expect(body.artworks[0]).toMatchObject({ title: 'Draft', image_count: 1 });
    expect(body.artworks[0]!.cover).not.toBeNull();
  });

  it('records admin actions in the audit log', async () => {
    const art = await createArt({ title: 'Audited' });
    const row = await env.DB.prepare(`SELECT actor_email, action, entity_id FROM audit_log WHERE action = 'artwork.create'`).first();
    expect(row).toEqual({ actor_email: 'dev@localhost', action: 'artwork.create', entity_id: art.id });
  });
});

describe('image upload (the Worker never trusts the browser)', () => {
  it('stores three variants in R2 and a row in D1', async () => {
    const art = await createArt();
    const updated = await upload(art.id, { alt: 'A blue painting', altDa: 'Et blåt maleri' });
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0]).toMatchObject({ alt_text: 'A blue painting', alt_text_da: 'Et blåt maleri', is_cover: true });
    for (const key of keysOf(updated.images[0]!.url)) {
      const head = await env.MEDIA.head(key);
      expect(head, key).not.toBeNull();
      expect(head!.httpMetadata?.contentType).toBe('image/webp');
      expect(head!.httpMetadata?.cacheControl).toBe('public, max-age=31536000, immutable');
    }
  });

  it('uses server-generated keys under artworks/{id}/', async () => {
    const art = await createArt();
    const updated = await upload(art.id);
    expect(new URL(updated.images[0]!.url).pathname).toMatch(new RegExp(`^/media/artworks/${art.id}/[0-9a-f-]{36}$`));
  });

  it('rejects a file that is not WebP even if it claims to be', async () => {
    const art = await createArt();
    const form = uploadForm();
    form.set('w480', new File([new TextEncoder().encode('<html>not an image</html>'.repeat(5))], 'x.webp', { type: 'image/webp' }));
    const res = await adminUpload(`/api/admin/artworks/${art.id}/images`, form);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_image');
  });

  it('rejects a JPEG', async () => {
    const art = await createArt();
    const form = uploadForm();
    const jpeg = new Uint8Array(100);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    form.set('w960', new File([jpeg], 'x.webp', { type: 'image/jpeg' }));
    expect((await adminUpload(`/api/admin/artworks/${art.id}/images`, form)).status).toBe(400);
  });

  it('rejects a missing variant', async () => {
    const art = await createArt();
    const res = await adminUpload(`/api/admin/artworks/${art.id}/images`, uploadForm({ skip: 1920 }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversized variant (over 4 MB)', async () => {
    const art = await createArt();
    const form = uploadForm();
    form.set('w1920', new File([makeWebp(1920, 2400, 4 * 1024 * 1024 + 10)], 'big.webp', { type: 'image/webp' }));
    const res = await adminUpload(`/api/admin/artworks/${art.id}/images`, form);
    expect(res.status).toBe(413);
  });

  it('rejects a variant wider than its nominal size', async () => {
    const art = await createArt();
    const form = uploadForm();
    form.set('w480', new File([makeWebp(900, 1125)], 'wide.webp', { type: 'image/webp' }));
    expect((await adminUpload(`/api/admin/artworks/${art.id}/images`, form)).status).toBe(400);
  });

  it('rejects variants with different proportions', async () => {
    const art = await createArt();
    expect((await adminUpload(`/api/admin/artworks/${art.id}/images`, uploadForm({ ratioOff: true }))).status).toBe(400);
  });

  it('accepts a small original (variants never upscaled past the source)', async () => {
    const art = await createArt();
    const form = new FormData();
    form.set('w480', new File([makeWebp(480, 600)], 'a.webp'));
    form.set('w960', new File([makeWebp(700, 875)], 'b.webp')); // source was only 700 wide
    form.set('w1920', new File([makeWebp(700, 875)], 'c.webp'));
    expect((await adminUpload(`/api/admin/artworks/${art.id}/images`, form)).status).toBe(201);
  });

  it('does not write to R2 or D1 when validation fails', async () => {
    const art = await createArt();
    await adminUpload(`/api/admin/artworks/${art.id}/images`, uploadForm({ skip: 960 }));
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM artwork_images').first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('limits the number of images per artwork', async () => {
    const art = await createArt();
    for (let i = 0; i < 20; i++) await upload(art.id);
    const res = await adminUpload(`/api/admin/artworks/${art.id}/images`, uploadForm());
    expect(res.status).toBe(400);
  }, 60_000);

  it('rejects an upload to an unknown artwork', async () => {
    expect((await adminUpload('/api/admin/artworks/nope/images', uploadForm())).status).toBe(404);
  });
});

describe('cover, order and deletion', () => {
  it('the first image is the cover until another is chosen; reordering keeps the choice', async () => {
    const art = await createArt();
    await upload(art.id);
    await upload(art.id);
    let a = await upload(art.id);
    expect(a.images.map((i) => i.is_cover)).toEqual([true, false, false]);
    const [first, second, third] = a.images;

    let res = await adminJson(`/api/admin/artworks/${art.id}/cover`, 'PUT', { imageId: third!.id });
    a = (await res.json()) as Art;
    expect(a.images.find((i) => i.is_cover)!.id).toBe(third!.id);

    res = await adminJson(`/api/admin/artworks/${art.id}/images/order`, 'PATCH', { ids: [third!.id, second!.id, first!.id] });
    expect(res.status).toBe(200);
    a = (await res.json()) as Art;
    expect(a.images.map((i) => i.id)).toEqual([third!.id, second!.id, first!.id]);
    expect(a.images.find((i) => i.is_cover)!.id).toBe(third!.id);
  });

  it('clearing the cover falls back to the first image', async () => {
    const art = await createArt();
    await upload(art.id);
    const a = await upload(art.id);
    await adminJson(`/api/admin/artworks/${art.id}/cover`, 'PUT', { imageId: a.images[1]!.id });
    const res = await adminJson(`/api/admin/artworks/${art.id}/cover`, 'PUT', { imageId: null });
    const cleared = (await res.json()) as Art;
    expect(cleared.images.find((i) => i.is_cover)!.id).toBe(a.images[0]!.id);
  });

  it('deleting the cover image falls back to the first remaining image', async () => {
    const art = await createArt();
    await upload(art.id);
    const a = await upload(art.id);
    await adminJson(`/api/admin/artworks/${art.id}/cover`, 'PUT', { imageId: a.images[1]!.id });
    const res = await adminJson(`/api/admin/artworks/${art.id}/images/${a.images[1]!.id}`, 'DELETE');
    const after = (await res.json()) as Art;
    expect(after.images).toHaveLength(1);
    expect(after.images[0]!.is_cover).toBe(true);
  });

  it('refuses a cover that belongs to another artwork, and a bad order list', async () => {
    const a = await createArt({ title: 'A' });
    const b = await createArt({ title: 'B' });
    const bWith = await upload(b.id);
    await upload(a.id);
    expect((await adminJson(`/api/admin/artworks/${a.id}/cover`, 'PUT', { imageId: bWith.images[0]!.id })).status).toBe(404);
    expect((await adminJson(`/api/admin/artworks/${a.id}/images/order`, 'PATCH', { ids: ['x'] })).status).toBe(400);
  });

  it('updates alt text in both languages', async () => {
    const art = await createArt();
    const a = await upload(art.id);
    const res = await adminJson(`/api/admin/artworks/${art.id}/images/${a.images[0]!.id}`, 'PATCH', {
      alt_text: 'New alt',
      alt_text_da: 'Ny alt',
    });
    const updated = (await res.json()) as Art;
    expect(updated.images[0]).toMatchObject({ alt_text: 'New alt', alt_text_da: 'Ny alt' });
  });

  it('deleting an image removes its three R2 objects', async () => {
    const art = await createArt();
    const a = await upload(art.id);
    const keys = keysOf(a.images[0]!.url);
    await adminJson(`/api/admin/artworks/${art.id}/images/${a.images[0]!.id}`, 'DELETE');
    for (const key of keys) expect(await env.MEDIA.head(key), key).toBeNull();
  });

  it('deleting an artwork removes its rows and every R2 object', async () => {
    const art = await createArt();
    await upload(art.id);
    await upload(art.id);
    expect((await env.MEDIA.list()).objects).toHaveLength(6);
    const res = await adminJson(`/api/admin/artworks/${art.id}`, 'DELETE');
    expect(res.status).toBe(200);
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM artwork_images').first<{ n: number }>();
    expect(n!.n).toBe(0);
    expect((await call(`/api/admin/artworks/${art.id}`)).status).toBe(404);
  });

  it('a failed R2 deletion is recorded for the cron retry and does not fail the request', async () => {
    const art = await createArt();
    const a = await upload(art.id);
    const original = env.MEDIA.delete.bind(env.MEDIA);
    (env.MEDIA as { delete: unknown }).delete = async () => {
      throw new Error('R2 unavailable');
    };
    try {
      const res = await adminJson(`/api/admin/artworks/${art.id}/images/${a.images[0]!.id}`, 'DELETE');
      expect(res.status).toBe(200);
    } finally {
      (env.MEDIA as { delete: unknown }).delete = original;
    }
    const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'r2_delete_failed' AND resolved = 0`).first<{ n: number }>();
    expect(open!.n).toBe(1);
  });

  it('a public page for the artwork disappears from the API once it is deleted', async () => {
    const art = await createArt({ status: 'available' });
    await upload(art.id);
    expect((await call(`/api/artworks/${art.slug}`)).status).toBe(200);
    await adminJson(`/api/admin/artworks/${art.id}`, 'DELETE');
    expect((await call(`/api/artworks/${art.slug}`)).status).toBe(404);
  });
});
