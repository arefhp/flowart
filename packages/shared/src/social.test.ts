import { describe, expect, it } from 'vitest';
import { normalizeSocialUrl } from './social';

describe('normalizeSocialUrl: owner-supplied links (section 4B)', () => {
  it('cleans the Instagram link', () => {
    expect(
      normalizeSocialUrl(
        'instagram',
        'https://www.instagram.com/zakereh.fadavi.art?vrfl=bTgzcXhjdjdya25x&utm_source=qr',
      ),
    ).toEqual({ ok: true, url: 'https://www.instagram.com/zakereh.fadavi.art/' });
  });

  it('cleans the Facebook share link', () => {
    expect(
      normalizeSocialUrl('facebook', 'https://www.facebook.com/share/1974LVc4VU/?mibextid=wwXIfr'),
    ).toEqual({ ok: true, url: 'https://www.facebook.com/share/1974LVc4VU/' });
  });

  it('cleans the TikTok link', () => {
    expect(
      normalizeSocialUrl('tiktok', 'https://www.tiktok.com/@zakerehfadaviart?_r=1&_t=ZN-9AQrRByMDSg'),
    ).toEqual({ ok: true, url: 'https://www.tiktok.com/@zakerehfadaviart' });
  });
});

describe('normalizeSocialUrl: validation', () => {
  it('rejects http, javascript and data links', () => {
    expect(normalizeSocialUrl('instagram', 'http://www.instagram.com/x/').ok).toBe(false);
    expect(normalizeSocialUrl('instagram', 'javascript:alert(1)').ok).toBe(false);
    expect(normalizeSocialUrl('other', 'data:text/html,hi').ok).toBe(false);
  });

  it('rejects credentials in the URL', () => {
    expect(normalizeSocialUrl('instagram', 'https://user:pw@instagram.com/x/').ok).toBe(false);
  });

  it('rejects a host that does not belong to the platform', () => {
    const r = normalizeSocialUrl('instagram', 'https://example.com/x/');
    expect(r).toEqual({ ok: false, error: 'This does not look like an Instagram link.' });
    expect(normalizeSocialUrl('instagram', 'https://notinstagram.com/x/').ok).toBe(false);
    expect(normalizeSocialUrl('instagram', 'https://evil.com/instagram.com/').ok).toBe(false);
  });

  it('rejects over-long links', () => {
    expect(normalizeSocialUrl('other', `https://example.com/${'a'.repeat(600)}`).ok).toBe(false);
  });

  it('accepts a link without a scheme and lowercases the host', () => {
    expect(normalizeSocialUrl('instagram', 'Instagram.com/Someone')).toEqual({
      ok: true,
      url: 'https://instagram.com/Someone/',
    });
  });

  it('keeps generic query parameters only for "other" and still strips tracking', () => {
    expect(normalizeSocialUrl('other', 'https://example.com/p?id=3&utm_source=x')).toEqual({
      ok: true,
      url: 'https://example.com/p?id=3',
    });
  });

  it('accepts regional host variants', () => {
    expect(normalizeSocialUrl('facebook', 'https://m.facebook.com/page').ok).toBe(true);
    expect(normalizeSocialUrl('tiktok', 'https://vm.tiktok.com/abc/').ok).toBe(true);
  });
});
