import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, insertArtwork } from './helpers';

const valid = {
  name: 'Maja Jensen',
  email: 'maja@example.com',
  message: 'I would love to know more about your workshops.',
  locale: 'en',
  turnstileToken: 'ignored-locally',
};

const post = (body: unknown, overrides: Parameters<typeof call>[2] = {}, headers: Record<string, string> = {}) =>
  call('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, overrides);

const live = { EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_live_abcdefghijk' };

function spyResend(status = 200) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith('https://api.resend.com/')) {
      return new Response(status === 200 ? '{"id":"1"}' : 'provider down', { status });
    }
    return real(input as RequestInfo, init);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('contact form', () => {
  it('saves the message, queues the owner email and replies 201', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const msg = await env.DB.prepare('SELECT name, email, message, locale FROM contact_messages').first();
    expect(msg).toEqual({ name: 'Maja Jensen', email: 'maja@example.com', message: valid.message, locale: 'en' });
    const mail = await env.DB.prepare('SELECT to_email, reply_to, status FROM email_outbox').first();
    expect(mail).toEqual({ to_email: 'info@zfadavi.com', reply_to: 'maja@example.com', status: 'sent' }); // console driver
  });

  it('From is the fixed site address; the visitor is only in Reply-To', async () => {
    const spy = spyResend();
    await post(valid, live);
    const call0 = spy.mock.calls.find(([u]) => String(u).startsWith('https://api.resend.com/'))!;
    const sent = JSON.parse(String((call0[1] as RequestInit).body));
    expect(sent.from).toBe('Zakereh Art <info@zfadavi.com>');
    expect(sent.reply_to).toBe('maja@example.com');
    expect(sent.to).toEqual(['info@zfadavi.com']);
    expect(sent.from).not.toContain('maja');
    expect(((call0[1] as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer re_live_abcdefghijk');
  });

  it('still saves the message when the email provider fails, and keeps it queued for retry', async () => {
    spyResend(500);
    const res = await post(valid, live);
    expect(res.status).toBe(201);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM contact_messages').first<{ n: number }>())!.n).toBe(1);
    const mail = await env.DB.prepare('SELECT status, attempts, last_error FROM email_outbox').first<{ status: string; attempts: number; last_error: string }>();
    expect(mail!.status).toBe('failed');
    expect(mail!.attempts).toBe(1);
    expect(mail!.last_error).toContain('500');
    expect(mail!.last_error).not.toContain('re_live');
  });

  it('neutralizes header injection in the email address', async () => {
    for (const email of ['a@b.co\r\nBcc: victim@example.com', 'a@b.co\nSubject: hacked', 'a@b.co, c@d.co', '"a b"@c.co']) {
      const res = await post({ ...valid, email });
      expect(res.status, email).toBe(400);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM contact_messages').first<{ n: number }>())!.n).toBe(0);
  });

  it('strips line breaks from the name before it reaches the subject', async () => {
    await post({ ...valid, name: 'Eve\r\nBcc: victim@example.com' });
    const mail = await env.DB.prepare('SELECT subject FROM email_outbox').first<{ subject: string }>();
    expect(mail!.subject).not.toMatch(/[\r\n]/);
  });

  it('escapes HTML in the email body', async () => {
    await post({ ...valid, message: '<script>alert(1)</script> hello there' });
    const mail = await env.DB.prepare('SELECT html_body FROM email_outbox').first<{ html_body: string }>();
    expect(mail!.html_body).not.toContain('<script>');
    expect(mail!.html_body).toContain('&lt;script&gt;');
  });

  it('validates name, email and message', async () => {
    expect((await post({ ...valid, name: '' })).status).toBe(400);
    expect((await post({ ...valid, email: 'not-an-email' })).status).toBe(400);
    expect((await post({ ...valid, message: 'hi' })).status).toBe(400);
    expect((await post({ ...valid, message: 'x'.repeat(5001) })).status).toBe(400);
    const res = await call('/api/contact', { method: 'POST', body: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects the request when Turnstile fails and saves nothing', async () => {
    const res = await post(valid, { TURNSTILE_SECRET_KEY: '2x0000000000000000000000000000000AA' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('turnstile_failed');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM contact_messages').first<{ n: number }>())!.n).toBe(0);
  });

  it('verifies real Turnstile tokens with the secret server-side', async () => {
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('challenges.cloudflare.com')) {
        const body = String((init as RequestInit).body);
        return new Response(JSON.stringify({ success: body.includes('response=good-token') }));
      }
      return real(input as RequestInfo, init);
    });
    const secret = { TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-value' };
    expect((await post({ ...valid, turnstileToken: 'good-token' }, secret)).status).toBe(201);
    expect((await post({ ...valid, turnstileToken: 'bad-token' }, secret)).status).toBe(400);
    expect((await post({ ...valid, turnstileToken: undefined }, secret)).status).toBe(400);
    expect(spy).toHaveBeenCalled();
  });

  it('rate limits repeated messages from one address in production (generous locally)', async () => {
    const production = {
      APP_ENV: 'production',
      ADMIN_DEV_BYPASS: undefined,
      PUBLIC_SITE_URL: 'https://zfadavi.com',
      MEDIA_BASE_URL: 'https://media.zfadavi.com',
      ACCESS_TEAM_NAME: 'team',
      ACCESS_AUD: 'aud',
      ADMIN_EMAILS: 'owner@example.com',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-value',
      ...live,
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('challenges.cloudflare.com')) return new Response(JSON.stringify({ success: true }));
      return new Response('{"id":"1"}', { status: 200 });
    });
    const headers = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let i = 0; i < 5; i++) expect((await post(valid, production, headers)).status).toBe(201);
    const res = await post(valid, production, headers);
    expect(res.status).toBe(429);
    // another visitor is not affected
    expect((await post(valid, production, { 'CF-Connecting-IP': '203.0.113.8' })).status).toBe(201);
    spy.mockRestore();
    // locally the limit is far higher
    for (let i = 0; i < 8; i++) expect((await post(valid, {}, headers)).status).toBe(201);
    // the limiter stores a hash, never the address
    const keys = await env.DB.prepare('SELECT key FROM rate_limits').all<{ key: string }>();
    expect(keys.results.some((r) => r.key.includes('203.0.113'))).toBe(false);
  });

  it('links an enquiry to an available artwork and names it in the email', async () => {
    const art = await insertArtwork({ title: 'Blue Hour', status: 'available' });
    const res = await post({ ...valid, artworkSlug: art.slug });
    expect(res.status).toBe(201);
    const msg = await env.DB.prepare('SELECT artwork_id FROM contact_messages').first<{ artwork_id: string }>();
    expect(msg!.artwork_id).toBe(art.id);
    const mail = await env.DB.prepare('SELECT subject, text_body FROM email_outbox').first<{ subject: string; text_body: string }>();
    expect(mail!.subject).toContain('Blue Hour');
    expect(mail!.text_body).toContain('Artwork:  Blue Hour');
  });

  it('does not link sold or hidden artworks, and ignores an unknown slug', async () => {
    const sold = await insertArtwork({ title: 'Sold one', status: 'sold' });
    const hidden = await insertArtwork({ title: 'Hidden one', status: 'hidden' });
    for (const slug of [sold.slug, hidden.slug, 'does-not-exist']) {
      expect((await post({ ...valid, artworkSlug: slug })).status).toBe(201);
    }
    const rows = await env.DB.prepare('SELECT artwork_id FROM contact_messages').all<{ artwork_id: string | null }>();
    expect(rows.results.every((r) => r.artwork_id === null)).toBe(true);
  });

  it('stores the page language', async () => {
    await post({ ...valid, locale: 'da' });
    const msg = await env.DB.prepare('SELECT locale FROM contact_messages').first<{ locale: string }>();
    expect(msg!.locale).toBe('da');
    const mail = await env.DB.prepare('SELECT text_body FROM email_outbox').first<{ text_body: string }>();
    expect(mail!.text_body).toContain('Language: Danish');
  });

  it('lists messages for the admin with the artwork title', async () => {
    const art = await insertArtwork({ title: 'Asked about' });
    await post({ ...valid, artworkSlug: art.slug });
    const res = await call('/api/admin/messages');
    const body = (await res.json()) as { messages: Array<{ name: string; artwork_title: string | null }> };
    expect(body.messages[0]).toMatchObject({ name: 'Maja Jensen', artwork_title: 'Asked about' });
  });
});
