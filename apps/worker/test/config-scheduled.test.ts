import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configProblems, isPlaceholder } from '../src/config';
import { enqueueEmail, flushOutbox } from '../src/email';
import { dailyPurge, runScheduled, FREQUENT_CRON, DAILY_CRON } from '../src/scheduled';
import { nowIso } from '../src/lib/http';
import { call, insertArtwork, testEnv } from './helpers';

const goodProd = {
  APP_ENV: 'production',
  ADMIN_DEV_BYPASS: undefined,
  PUBLIC_SITE_URL: 'https://zfadavi.com',
  MEDIA_BASE_URL: 'https://media.zfadavi.com',
  ACCESS_TEAM_NAME: 'team',
  ACCESS_AUD: 'aud',
  ADMIN_EMAILS: 'owner@example.com',
  EMAIL_DRIVER: 'resend',
  RESEND_API_KEY: 're_live_abcdefghijk',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAAreal-secret-value',
  STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890',
  STRIPE_WEBHOOK_SECRET: 'whsec_realvalue1234567890',
  STRIPE_FAKE: undefined,
};

afterEach(() => vi.restoreAllMocks());

describe('configuration validation (names only, never values)', () => {
  it('local development needs very little', () => {
    expect(configProblems(testEnv())).toEqual([]);
  });

  it('a complete production configuration has no problems', () => {
    expect(configProblems(testEnv(goodProd))).toEqual([]);
  });

  it('flags every missing production variable by name', () => {
    const problems = configProblems(
      testEnv({ ...goodProd, ACCESS_TEAM_NAME: '', ACCESS_AUD: undefined, ADMIN_EMAILS: ' , ', RESEND_API_KEY: 're_xxx', TURNSTILE_SECRET_KEY: 'CHANGE_ME' }),
    );
    const text = problems.join('|');
    for (const name of ['ACCESS_TEAM_NAME', 'ACCESS_AUD', 'ADMIN_EMAILS', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY']) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('re_xxx');
    expect(text).not.toContain('CHANGE_ME');
  });

  it('rejects the Turnstile test secret, the console email driver and an http site in production', () => {
    const text = configProblems(
      testEnv({ ...goodProd, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', EMAIL_DRIVER: 'console', PUBLIC_SITE_URL: 'http://zfadavi.com' }),
    ).join('|');
    expect(text).toContain('TURNSTILE_SECRET_KEY');
    expect(text).toContain('EMAIL_DRIVER');
    expect(text).toContain('PUBLIC_SITE_URL');
  });

  it('requires the sender domain to match the site domain', () => {
    const text = configProblems(testEnv({ ...goodProd, EMAIL_FROM_ADDRESS: 'info@other-domain.com' })).join('|');
    expect(text).toContain('EMAIL_FROM_ADDRESS');
  });

  it('rejects an unknown APP_ENV', () => {
    expect(configProblems(testEnv({ APP_ENV: 'staging' })).join('|')).toContain('APP_ENV');
  });

  it('recognizes placeholders', () => {
    for (const v of ['', '  ', 'CHANGE_ME', 'change-me', 're_xxx', 'sk_test_xxx', 'whsec_xxx', undefined]) {
      expect(isPlaceholder(v), String(v)).toBe(true);
    }
    for (const v of ['re_live_abcdefghijk', '0x4AAAAAAAreal-secret-value']) expect(isPlaceholder(v)).toBe(false);
  });

  it('an unconfigured production Worker answers 500 with variable names for every API route except health', async () => {
    const res = await call('/api/artworks', {}, { ...goodProd, ACCESS_AUD: '' });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain('ACCESS_AUD');
    expect((await call('/api/health', {}, { ...goodProd, ACCESS_AUD: '' })).status).toBe(200);
  });
});

describe('email outbox retries', () => {
  const failing = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('down', { status: 503 }));
  const resend = () => testEnv({ EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_live_abcdefghijk' });
  const mail = { kind: 'test', to: 'a@example.com', subject: 'Hi', text: 'Hello' };

  it('sends queued mail on the cron run', async () => {
    const id = await enqueueEmail(testEnv(), mail);
    expect(await flushOutbox(testEnv())).toBe(1);
    const row = await env.DB.prepare('SELECT status FROM email_outbox WHERE id = ?1').bind(id).first<{ status: string }>();
    expect(row!.status).toBe('sent');
  });

  it('backs off after a failure and gives up (dead) after 8 attempts', async () => {
    failing();
    const id = await enqueueEmail(testEnv(), mail);
    for (let attempt = 1; attempt <= 8; attempt++) {
      await env.DB.prepare('UPDATE email_outbox SET next_attempt_at = ?2 WHERE id = ?1').bind(id, '2000-01-01T00:00:00.000Z').run();
      await flushOutbox(resend());
      const row = await env.DB.prepare('SELECT status, attempts, next_attempt_at FROM email_outbox WHERE id = ?1').bind(id).first<{ status: string; attempts: number; next_attempt_at: string }>();
      expect(row!.attempts).toBe(attempt);
      if (attempt < 8) {
        expect(row!.status).toBe('failed');
        expect(row!.next_attempt_at > nowIso()).toBe(true);
      } else {
        expect(row!.status).toBe('dead');
      }
    }
  });

  it('does not retry mail that is not yet due', async () => {
    const id = await enqueueEmail(testEnv(), mail);
    await env.DB.prepare('UPDATE email_outbox SET next_attempt_at = ?2 WHERE id = ?1').bind(id, '2999-01-01T00:00:00.000Z').run();
    expect(await flushOutbox(testEnv())).toBe(0);
  });

  it('defers instead of dropping mail once the daily cap is reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"id":"1"}', { status: 200 }));
    for (let i = 0; i < 90; i++) {
      await env.DB.prepare(
        `INSERT INTO email_outbox (id, kind, to_email, subject, text_body, status, next_attempt_at, created_at, sent_at)
         VALUES (?1,'t','a@b.co','s','b','sent',?2,?2,?2)`,
      ).bind(`sent-${i}`, nowIso()).run();
    }
    const id = await enqueueEmail(testEnv(), mail);
    expect(await flushOutbox(resend())).toBe(0);
    const row = await env.DB.prepare('SELECT status, next_attempt_at FROM email_outbox WHERE id = ?1').bind(id).first<{ status: string; next_attempt_at: string }>();
    expect(row!.status).toBe('pending'); // not dropped
    expect(row!.next_attempt_at > nowIso()).toBe(true);
  });

  it('refuses to send with a placeholder Resend key and keeps the mail queued', async () => {
    const id = await enqueueEmail(testEnv(), mail);
    expect(await flushOutbox(testEnv({ EMAIL_DRIVER: 'resend', RESEND_API_KEY: 're_xxx' }))).toBe(0);
    const row = await env.DB.prepare('SELECT status FROM email_outbox WHERE id = ?1').bind(id).first<{ status: string }>();
    expect(row!.status).toBe('pending');
  });
});

describe('scheduled jobs', () => {
  it('the 15-minute cron flushes the outbox', async () => {
    await enqueueEmail(testEnv(), { kind: 't', to: 'a@example.com', subject: 's', text: 'b' });
    await runScheduled(FREQUENT_CRON, testEnv());
    const row = await env.DB.prepare('SELECT status FROM email_outbox').first<{ status: string }>();
    expect(row!.status).toBe('sent');
  });

  it('the daily cron purges old rate limits, old contact messages and old sent mail', async () => {
    const old = '2000-01-01T00:00:00.000Z';
    await env.DB.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES ('k', 100, 1), ('fresh', ?1, 1)`).bind(Math.floor(Date.now() / 1000)).run();
    await env.DB.prepare(`INSERT INTO contact_messages (id, name, email, message, locale, created_at) VALUES ('old','n','e@x.co','m','en',?1), ('new','n','e@x.co','m','en',?2)`).bind(old, nowIso()).run();
    await env.DB.prepare(`INSERT INTO email_outbox (id, kind, to_email, subject, text_body, status, next_attempt_at, created_at) VALUES ('o1','t','a@b.co','s','b','sent',?1,?1)`).bind(old).run();
    await runScheduled(DAILY_CRON, testEnv());
    expect((await env.DB.prepare('SELECT key FROM rate_limits').all()).results).toHaveLength(1);
    expect((await env.DB.prepare('SELECT id FROM contact_messages').all<{ id: string }>()).results.map((r) => r.id)).toEqual(['new']);
    expect((await env.DB.prepare('SELECT id FROM email_outbox').all()).results).toHaveLength(0);
  });

  it('the retention period is configurable', async () => {
    const sixMonthsAgo = new Date(Date.now() - 200 * 86_400_000).toISOString();
    await env.DB.prepare(`INSERT INTO contact_messages (id, name, email, message, locale, created_at) VALUES ('m','n','e@x.co','m','en',?1)`).bind(sixMonthsAgo).run();
    await dailyPurge(testEnv({ CONTACT_RETENTION_MONTHS: '12' }));
    expect((await env.DB.prepare('SELECT id FROM contact_messages').all()).results).toHaveLength(1);
    await dailyPurge(testEnv({ CONTACT_RETENTION_MONTHS: '3' }));
    expect((await env.DB.prepare('SELECT id FROM contact_messages').all()).results).toHaveLength(0);
  });

  it('the cron retries R2 deletions that failed earlier', async () => {
    await env.MEDIA.put('artworks/x/y-480.webp', new Uint8Array([1]));
    await env.DB.prepare(
      `INSERT INTO audit_log (id, at, actor_email, action, details, resolved) VALUES ('a', ?1, 'dev', 'r2_delete_failed', ?2, 0)`,
    ).bind(nowIso(), JSON.stringify({ keys: ['artworks/x/y-480.webp'] })).run();
    await runScheduled(FREQUENT_CRON, testEnv());
    expect(await env.MEDIA.head('artworks/x/y-480.webp')).toBeNull();
    const row = await env.DB.prepare(`SELECT resolved FROM audit_log WHERE id = 'a'`).first<{ resolved: number }>();
    expect(row!.resolved).toBe(1);
  });
});

describe('local media route (never in production)', () => {
  it('serves variants from R2 locally with a long cache and the right type', async () => {
    const art = await insertArtwork();
    await env.MEDIA.put(`artworks/${art.id}/abc-480.webp`, new Uint8Array([1, 2, 3]));
    const res = await call(`/media/artworks/${art.id}/abc-480.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Cache-Control')).toContain('max-age');
  });

  it('answers 404 in production and for keys outside the allowed pattern', async () => {
    await env.MEDIA.put('artworks/a/b-480.webp', new Uint8Array([1]));
    expect((await call('/media/artworks/a/b-480.webp', {}, goodProd)).status).toBe(404);
    expect((await call('/media/../secrets.txt')).status).toBe(404);
    expect((await call('/media/artworks/a/b.png')).status).toBe(404);
    expect((await call('/media/artworks/a/missing-480.webp')).status).toBe(404);
  });
});
