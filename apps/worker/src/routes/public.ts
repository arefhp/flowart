import { parseLocale } from '@flowart/shared';
import { Hono } from 'hono';
import { isLocal } from '../config';
import { contactNotification, flushOutbox, enqueueEmail } from '../email';
import { badRequest, HttpError, nowIso, uuid, type AppBindings } from '../lib/http';
import { allowRequest, clientIp } from '../lib/rate-limit';
import { getState } from '../lib/site-state';
import { verifyTurnstile } from '../lib/turnstile';
import { getCtx } from '../middleware';
import { contactInput, parse, readJson } from '../schemas';
import { findPublicArtworkBySlug, getPublicArtwork, listPublicArtworks } from '../services/artworks';
import { getPublicAbout } from '../services/about';
import { listPublicCategories } from '../services/categories';
import { getPublicSocial } from '../services/social';

export const publicRoutes = new Hono<AppBindings>();

const PUBLIC_CACHE = 'public, max-age=60';

publicRoutes.get('/health', (c) => c.json({ ok: true }));

publicRoutes.get('/health/ready', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ ok: true });
});

publicRoutes.get('/site-version', async (c) => {
  const contentUpdatedAt = await getState(c.env, 'content_updated_at');
  return c.json({ contentUpdatedAt }, 200, { 'Cache-Control': 'no-store' });
});

/** Categories visitors can filter by (only ones with at least one shown artwork). */
publicRoutes.get('/categories', async (c) => {
  const lang = parseLocale(c.req.query('lang'));
  return c.json({ categories: await listPublicCategories(c.env, lang) }, 200, { 'Cache-Control': PUBLIC_CACHE });
});

publicRoutes.get('/artworks', async (c) => {
  const lang = parseLocale(c.req.query('lang'));
  const artworks = await listPublicArtworks(c.env, lang, { featured: c.req.query('featured') === '1' });
  return c.json({ artworks }, 200, { 'Cache-Control': PUBLIC_CACHE });
});

publicRoutes.get('/artworks/:slug', async (c) => {
  const lang = parseLocale(c.req.query('lang'));
  const artwork = await getPublicArtwork(c.env, c.req.param('slug'), lang);
  return c.json(artwork, 200, { 'Cache-Control': PUBLIC_CACHE });
});

publicRoutes.get('/about', async (c) => {
  const lang = parseLocale(c.req.query('lang'));
  return c.json(await getPublicAbout(c.env, lang), 200, { 'Cache-Control': PUBLIC_CACHE });
});

publicRoutes.get('/social', async (c) => {
  return c.json(await getPublicSocial(c.env), 200, { 'Cache-Control': PUBLIC_CACHE });
});

const CONTACT_LIMIT_PER_HOUR = 5;
const CONTACT_GLOBAL_LIMIT_PER_HOUR = 60;

/**
 * Contact form: validate, rate limit, verify Turnstile, save to D1, then queue the owner email.
 * The message is saved even if email delivery fails.
 */
publicRoutes.post('/contact', async (c) => {
  const input = parse(contactInput, await readJson(c.req.raw, 20_000));
  const ip = clientIp(c.req.raw);

  // Strict in production; generous locally so repeated testing is never blocked.
  const perIp = isLocal(c.env) ? 1000 : CONTACT_LIMIT_PER_HOUR;
  const everyone = isLocal(c.env) ? 10_000 : CONTACT_GLOBAL_LIMIT_PER_HOUR;
  const allowed =
    (await allowRequest(c.env, 'contact-ip', ip, perIp, 3600)) &&
    (await allowRequest(c.env, 'contact-all', 'all', everyone, 3600));
  if (!allowed) throw new HttpError(429, 'rate_limited', 'Too many messages. Please try again later.');

  const human = await verifyTurnstile(c.env, input.turnstileToken, ip);
  if (!human.ok) {
    throw badRequest('turnstile_failed', 'We could not verify that you are human. Please try again.');
  }

  const artwork = input.artworkSlug ? await findPublicArtworkBySlug(c.env, input.artworkSlug) : null;
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO contact_messages (id, name, email, message, locale, artwork_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`,
  )
    .bind(id, input.name, input.email, input.message, input.locale, artwork?.id ?? null, nowIso())
    .run();

  // Queue, then try to send without blocking the response; cron retries failures.
  try {
    const outboxId = await enqueueEmail(
      c.env,
      contactNotification(c.env, {
        name: input.name,
        email: input.email,
        message: input.message,
        locale: input.locale,
        artworkTitle: artwork?.title ?? null,
      }),
    );
    getCtx(c).waitUntil(flushOutbox(c.env, { onlyId: outboxId }));
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'could not queue contact email', error: String(err) }));
  }
  return c.json({ ok: true }, 201);
});
