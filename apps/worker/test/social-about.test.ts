import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { adminJson, adminUpload, call, uploadForm } from './helpers';

type Links = { links: Array<{ id: string; platform: string; url: string; label: string | null; visible: boolean }> };

describe('social links (spec 4B)', () => {
  it('seeds the three owner links in their cleaned form, in order', async () => {
    const res = await call('/api/social');
    expect(await res.json()).toEqual({
      links: [
        { platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/zakereh.fadavi.art/' },
        { platform: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/share/1974LVc4VU/' },
        { platform: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@zakerehfadaviart' },
      ],
    });
  });

  it('public rows never expose id, visible or sort_order', async () => {
    const raw = await (await call('/api/social')).text();
    for (const key of ['"id"', 'visible', 'sort_order']) expect(raw).not.toContain(key);
  });

  it('hidden links never reach the public API; hiding them all gives an empty list', async () => {
    const admin = (await (await call('/api/admin/social')).json()) as Links;
    const hideFacebook = admin.links.map((l) => ({ ...l, visible: l.platform !== 'facebook' }));
    await adminJson('/api/admin/social', 'PUT', { links: hideFacebook });
    let pub = (await (await call('/api/social')).json()) as { links: Array<{ platform: string }> };
    expect(pub.links.map((l) => l.platform)).toEqual(['instagram', 'tiktok']);

    await adminJson('/api/admin/social', 'PUT', { links: admin.links.map((l) => ({ ...l, visible: false })) });
    pub = (await (await call('/api/social')).json()) as { links: Array<{ platform: string }> };
    expect(pub.links).toEqual([]);
  });

  it('normalizes the owner-supplied raw links when saving and never stores the raw value', async () => {
    const res = await adminJson('/api/admin/social', 'PUT', {
      links: [
        { platform: 'instagram', url: 'https://www.instagram.com/zakereh.fadavi.art?vrfl=bTgzcXhjdjdya25x&utm_source=qr', label: null, visible: true },
        { platform: 'facebook', url: 'https://www.facebook.com/share/1974LVc4VU/?mibextid=wwXIfr', label: null, visible: true },
        { platform: 'tiktok', url: 'https://www.tiktok.com/@zakerehfadaviart?_r=1&_t=ZN-9AQrRByMDSg', label: null, visible: true },
      ],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Links).links.map((l) => l.url)).toEqual([
      'https://www.instagram.com/zakereh.fadavi.art/',
      'https://www.facebook.com/share/1974LVc4VU/',
      'https://www.tiktok.com/@zakerehfadaviart',
    ]);
    const stored = await env.DB.prepare(`SELECT url FROM social_links WHERE url LIKE '%utm_%' OR url LIKE '%mibextid%' OR url LIKE '%_t=%'`).all();
    expect(stored.results).toHaveLength(0);
  });

  it('saves the new order', async () => {
    const admin = (await (await call('/api/admin/social')).json()) as Links;
    await adminJson('/api/admin/social', 'PUT', { links: [...admin.links].reverse() });
    const pub = (await (await call('/api/social')).json()) as { links: Array<{ platform: string }> };
    expect(pub.links.map((l) => l.platform)).toEqual(['tiktok', 'facebook', 'instagram']);
  });

  it('validates every row and reports the field', async () => {
    const attempts: Array<[object, string]> = [
      [{ platform: 'instagram', url: 'http://www.instagram.com/x/', label: null, visible: true }, 'https'],
      [{ platform: 'instagram', url: 'javascript:alert(1)', label: null, visible: true }, ''],
      [{ platform: 'instagram', url: 'https://u:p@instagram.com/x/', label: null, visible: true }, 'username'],
      [{ platform: 'instagram', url: 'https://example.com/x/', label: null, visible: true }, 'Instagram'],
      [{ platform: 'instagram', url: `https://instagram.com/${'a'.repeat(600)}`, label: null, visible: true }, 'long'],
      [{ platform: 'other', url: 'https://example.com/', label: null, visible: true }, 'name'],
    ];
    for (const [row, hint] of attempts) {
      const res = await adminJson('/api/admin/social', 'PUT', { links: [row] });
      expect(res.status, JSON.stringify(row)).toBe(400);
      const body = (await res.json()) as { error: { message: string; details: { fields: Record<string, string> } } };
      expect(Object.keys(body.error.details.fields)[0]).toMatch(/^links\.0\./);
      if (hint) expect(body.error.message.toLowerCase()).toContain(hint.toLowerCase());
    }
  });

  it('rejects a duplicate platform except "other", and more than 12 links', async () => {
    const dup = await adminJson('/api/admin/social', 'PUT', {
      links: [
        { platform: 'instagram', url: 'https://instagram.com/a', label: null, visible: true },
        { platform: 'instagram', url: 'https://instagram.com/b', label: null, visible: true },
      ],
    });
    expect(dup.status).toBe(400);

    const others = Array.from({ length: 2 }, (_, i) => ({ platform: 'other', url: `https://example.com/${i}`, label: `Site ${i}`, visible: true }));
    expect((await adminJson('/api/admin/social', 'PUT', { links: others })).status).toBe(200);

    const tooMany = Array.from({ length: 13 }, (_, i) => ({ platform: 'other', url: `https://example.com/${i}`, label: `Site ${i}`, visible: true }));
    expect((await adminJson('/api/admin/social', 'PUT', { links: tooMany })).status).toBe(400);
  });

  it('a rejected save leaves the existing links untouched (atomic)', async () => {
    await adminJson('/api/admin/social', 'PUT', { links: [{ platform: 'instagram', url: 'https://example.com', label: null, visible: true }] });
    const pub = (await (await call('/api/social')).json()) as { links: unknown[] };
    expect(pub.links).toHaveLength(3);
  });

  it('uses the custom label for "other" links', async () => {
    await adminJson('/api/admin/social', 'PUT', {
      links: [{ platform: 'other', url: 'https://example.com/me', label: 'My shop', visible: true }],
    });
    const pub = (await (await call('/api/social')).json()) as { links: Array<{ label: string }> };
    expect(pub.links[0]!.label).toBe('My shop');
  });
});

describe('About page (spec 4A)', () => {
  type PublicAbout = { heading?: string; body: string; portrait?: { url: string; alt: string; width: number; height: number } };

  it('has the seeded text, split into paragraphs, and no portrait key', async () => {
    const res = await call('/api/about');
    const about = (await res.json()) as PublicAbout;
    expect(about.body.split('\n\n')).toHaveLength(4);
    expect(about.body).toContain('Persian miniature painting');
    expect(about).not.toHaveProperty('portrait');
    expect(about).not.toHaveProperty('heading');
  });

  it('Danish falls back to English until Danish text exists', async () => {
    const en = (await (await call('/api/about?lang=en')).json()) as PublicAbout;
    const daBefore = (await (await call('/api/about?lang=da')).json()) as PublicAbout;
    expect(daBefore.body).toBe(en.body);
    await adminJson('/api/admin/about', 'PUT', { heading: 'About', heading_da: 'Om mig', body: en.body, body_da: 'Dansk tekst.' });
    const da = (await (await call('/api/about?lang=da')).json()) as PublicAbout;
    expect(da).toMatchObject({ heading: 'Om mig', body: 'Dansk tekst.' });
    const stillEn = (await (await call('/api/about?lang=en')).json()) as PublicAbout;
    expect(stillEn).toMatchObject({ heading: 'About', body: en.body });
  });

  it('requires English text and enforces the length limit', async () => {
    expect((await adminJson('/api/admin/about', 'PUT', { body: '   ' })).status).toBe(400);
    expect((await adminJson('/api/admin/about', 'PUT', { body: 'x'.repeat(5001) })).status).toBe(400);
  });

  it('a portrait needs alt text', async () => {
    const form = uploadForm();
    const res = await adminUpload('/api/admin/about/portrait', form);
    expect(res.status).toBe(400);
  });

  it('uploading a portrait adds it publicly with its size; removing it deletes the objects', async () => {
    const form = uploadForm();
    form.set('portrait_alt', 'Portrait of the artist in her studio');
    form.set('portrait_alt_da', 'Portræt af kunstneren i hendes atelier');
    const res = await adminUpload('/api/admin/about/portrait', form);
    expect(res.status).toBe(201);

    const about = (await (await call('/api/about')).json()) as PublicAbout;
    expect(about.portrait).toMatchObject({ alt: 'Portrait of the artist in her studio', width: 1920, height: 2400 });
    expect(about.portrait!.url).toMatch(/\/media\/site\/about\/[0-9a-f-]{36}$/);
    const da = (await (await call('/api/about?lang=da')).json()) as PublicAbout;
    expect(da.portrait!.alt).toBe('Portræt af kunstneren i hendes atelier');
    expect((await env.MEDIA.list()).objects).toHaveLength(3);

    const del = await adminJson('/api/admin/about/portrait', 'DELETE');
    expect(del.status).toBe(200);
    expect(await (await call('/api/about')).json()).not.toHaveProperty('portrait');
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it('replacing the portrait deletes the old R2 objects', async () => {
    for (const alt of ['First', 'Second']) {
      const form = uploadForm();
      form.set('portrait_alt', alt);
      expect((await adminUpload('/api/admin/about/portrait', form)).status).toBe(201);
    }
    expect((await env.MEDIA.list()).objects).toHaveLength(3);
  });

  it('rejects an invalid portrait file', async () => {
    const form = uploadForm({ skip: 480 });
    form.set('portrait_alt', 'x');
    expect((await adminUpload('/api/admin/about/portrait', form)).status).toBe(400);
  });

  it('keeps the alt text when saving the text, and refuses to clear it while a portrait exists', async () => {
    const form = uploadForm();
    form.set('portrait_alt', 'Alt');
    await adminUpload('/api/admin/about/portrait', form);
    const about = (await (await call('/api/admin/about')).json()) as { body: string };
    const ok = await adminJson('/api/admin/about', 'PUT', { body: about.body, portrait_alt: 'Alt two' });
    expect(ok.status).toBe(200);
    const bad = await adminJson('/api/admin/about', 'PUT', { body: about.body, portrait_alt: '' });
    expect(bad.status).toBe(400);
  });
});
