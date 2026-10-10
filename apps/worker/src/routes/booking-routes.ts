import { localePath, parseLocale } from '@flowart/shared';
import { Hono } from 'hono';
import { isLocal, isPlaceholder, siteOrigin, stripeMode } from '../config';
import { flushOutbox } from '../email';
import type { Env } from '../env';
import { badRequest, HttpError, notFound, uuid, type AppBindings } from '../lib/http';
import { allowRequest, clientIp } from '../lib/rate-limit';
import { verifyWebhookSignature } from '../lib/stripe';
import { verifyTurnstile } from '../lib/turnstile';
import { getCtx } from '../middleware';
import { bookingInput, parse, readJson } from '../schemas';
import { createBooking, getBookingStatus, loadBookingById } from '../services/bookings';
import { handleStripeEvent, type StripeEvent } from '../services/payments';

/** Online booking, the Stripe webhook and the local-only pretend payment page. Mounted under /api. */
export const bookingRoutes = new Hono<AppBindings>();

const BOOKING_LIMIT_PER_HOUR = 8;
const BOOKING_PER_EMAIL_PER_HOUR = 5;
const BOOKING_GLOBAL_LIMIT_PER_HOUR = 120;

/** Reserve places. A free workshop is confirmed at once; a paid one returns the payment page address. */
bookingRoutes.post('/events/:slug/bookings', async (c) => {
  const input = parse(bookingInput, await readJson(c.req.raw, 20_000));
  const ip = clientIp(c.req.raw);

  // Strict in production (a held place is scarce); generous locally so testing is never blocked.
  const local = isLocal(c.env);
  const allowed =
    (await allowRequest(c.env, 'booking-ip', ip, local ? 1000 : BOOKING_LIMIT_PER_HOUR, 3600)) &&
    (await allowRequest(c.env, 'booking-email', input.email.toLowerCase(), local ? 1000 : BOOKING_PER_EMAIL_PER_HOUR, 3600)) &&
    (await allowRequest(c.env, 'booking-all', 'all', local ? 10_000 : BOOKING_GLOBAL_LIMIT_PER_HOUR, 3600));
  if (!allowed) throw new HttpError(429, 'rate_limited', 'Too many booking attempts. Please try again later.');

  const human = await verifyTurnstile(c.env, input.turnstileToken, ip);
  if (!human.ok) throw badRequest('turnstile_failed', 'We could not verify that you are human. Please try again.');

  const result = await createBooking(c.env, getCtx(c), c.req.param('slug'), input);
  return c.json(result, 201, { 'Cache-Control': 'no-store' });
});

/** For the "thank you" page. Knows only what that page needs, found by the unguessable token. */
bookingRoutes.get('/bookings/:token', async (c) => {
  if (!(await allowRequest(c.env, 'booking-status', clientIp(c.req.raw), isLocal(c.env) ? 100_000 : 240, 600))) {
    throw new HttpError(429, 'rate_limited', 'Too many requests. Please try again shortly.');
  }
  return c.json(await getBookingStatus(c.env, c.req.param('token'), parseLocale(c.req.query('lang'))), 200, {
    'Cache-Control': 'no-store',
  });
});

/**
 * Stripe tells us here that a payment finished, a payment page expired or a refund happened. The only
 * proof accepted is the signature over the RAW body, so it is read as text and never re-serialised.
 */
bookingRoutes.post('/stripe/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (isPlaceholder(secret)) throw new HttpError(503, 'webhook_not_configured', 'The webhook is not configured.');
  const raw = await c.req.raw.text();
  if (raw.length > 1_000_000) throw new HttpError(413, 'too_large', 'The request is too large.');
  if (!(await verifyWebhookSignature(secret!, raw, c.req.header('Stripe-Signature')))) {
    throw new HttpError(400, 'bad_signature', 'The signature is not valid.');
  }
  let evt: StripeEvent;
  try {
    evt = JSON.parse(raw) as StripeEvent;
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (typeof evt?.id !== 'string' || typeof evt?.type !== 'string' || typeof evt?.data?.object !== 'object' || evt.data.object === null) {
    throw new HttpError(400, 'invalid_event', 'This is not a Stripe event.');
  }
  const outcome = await handleStripeEvent(c.env, evt);
  getCtx(c).waitUntil(flushOutbox(c.env, { limit: 10 }));
  return c.json({ received: true, outcome });
});

// ---------------------------------------------------------------------------
// Local-only pretend payment page (no Stripe account needed). 404 everywhere else.
// ---------------------------------------------------------------------------

function fakeStripeOnly(env: Env) {
  if (stripeMode(env) !== 'fake') throw notFound();
}

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{font-family:system-ui,sans-serif;max-width:30rem;margin:3rem auto;padding:0 1rem;color:#222}button{font:inherit;padding:.6rem 1rem;margin:.25rem .25rem .25rem 0;cursor:pointer}.note{background:#fff7d6;border:1px solid #e6d27a;padding:.75rem;border-radius:6px}</style>` +
  `</head><body>${body}</body></html>`;

bookingRoutes.get('/dev/stripe/checkout/:bookingId', async (c) => {
  fakeStripeOnly(c.env);
  const b = await loadBookingById(c.env, c.req.param('bookingId'));
  if (!b || b.booking_status !== 'pending') throw notFound();
  return c.html(
    page(
      'Pretend payment',
      `<p class="note"><b>Local test only.</b> This pretend payment page stands in for Stripe. No money moves.</p>` +
        `<h1>Pay ${b.currency} ${(b.amount_minor / 100).toFixed(2)}</h1>` +
        `<p>${b.number_of_participants} place(s)</p>` +
        `<form method="post">` +
        `<button name="action" value="pay" id="fake-pay">Pay (pretend)</button>` +
        `<button name="action" value="cancel" id="fake-cancel">Go back</button>` +
        `<button name="action" value="expire" id="fake-expire">Let the payment page expire</button>` +
        `</form>`,
    ),
  );
});

bookingRoutes.post('/dev/stripe/checkout/:bookingId', async (c) => {
  fakeStripeOnly(c.env);
  const b = await loadBookingById(c.env, c.req.param('bookingId'));
  if (!b || !b.stripe_checkout_session_id) throw notFound();
  const action = String((await c.req.formData()).get('action') ?? '');
  const origin = siteOrigin(c.env);
  const success = `${origin}${localePath(b.locale, '/booking/success')}?token=${b.public_token}`;
  const cancel = `${origin}${localePath(b.locale, '/booking/cancelled')}?token=${b.public_token}`;
  const session = {
    id: b.stripe_checkout_session_id,
    client_reference_id: b.id,
    payment_status: 'paid',
    amount_total: b.amount_minor,
    currency: b.currency.toLowerCase(),
    payment_intent: `pi_fake_${b.id.replace(/-/g, '')}`,
  };
  // The same handler a real Stripe webhook reaches (only the signature check is skipped).
  if (action === 'pay') {
    await handleStripeEvent(c.env, { id: `evt_fake_${uuid()}`, type: 'checkout.session.completed', data: { object: session } });
    getCtx(c).waitUntil(flushOutbox(c.env, { limit: 10 }));
    return c.redirect(success, 303);
  }
  if (action === 'expire') {
    await handleStripeEvent(c.env, { id: `evt_fake_${uuid()}`, type: 'checkout.session.expired', data: { object: session } });
  }
  return c.redirect(cancel, 303);
});
