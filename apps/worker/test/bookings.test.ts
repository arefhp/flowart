import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScheduled, FREQUENT_CRON } from '../src/scheduled';
import { expireStaleHolds } from '../src/services/bookings';
import { book, created, errorOf, outbox, rowByToken, type Created } from './booking-helpers';
import { call, insertBooking, insertEvent, testEnv } from './helpers';

const availability = async (slug: string) =>
  (await (await call(`/api/events/${slug}/availability`)).json()) as { remaining: number; soldOut: boolean; taken: number };

afterEach(() => vi.restoreAllMocks());

describe('booking a paid workshop', () => {
  it('reserves the places, holds them for 30 minutes and returns the payment page', async () => {
    const ev = await insertEvent({ price_minor: 55000, max_participants: 8 });
    const res = await created(await book(ev.slug));
    expect(res.checkoutUrl).toMatch(/\/api\/dev\/stripe\/checkout\/[0-9a-f-]{36}$/);
    expect(res.bookingToken.length).toBeGreaterThanOrEqual(30);

    const row = await rowByToken(res.bookingToken);
    expect(row).toMatchObject({
      booking_status: 'pending',
      payment_status: 'pending',
      number_of_participants: 2,
      amount_minor: 110000, // 2 x 550.00, computed on the server
      currency: 'DKK',
      customer_name: 'Anna Jensen',
      locale: 'en',
    });
    expect(String(row!.stripe_checkout_session_id)).toMatch(/^cs_test_fake_/);
    const minutes = (Date.parse(String(row!.hold_expires_at)) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30.1);
    expect(row!.consent_accepted_at).toBeTruthy();

    expect(await availability(ev.slug)).toMatchObject({ taken: 2, remaining: 6 }); // held places count
    expect(await outbox()).toHaveLength(0); // nothing is sent until payment succeeds
  });

  it('ignores any price the browser sends', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    const res = await created(await book(ev.slug, { participants: 1, amount_minor: 1, price_minor: 1, amount: 1, unit_amount: 1 }));
    expect((await rowByToken(res.bookingToken))!.amount_minor).toBe(55000);
  });

  it('validates the form with friendly per-field messages', async () => {
    const ev = await insertEvent();
    for (const [body, field] of [
      [{ name: '' }, 'name'],
      [{ email: 'not-an-email' }, 'email'],
      [{ participants: 0 }, 'participants'],
      [{ participants: 1.5 }, 'participants'],
      [{ participants: 'two' }, 'participants'],
      [{ consent: false }, 'consent'],
      [{ consent: undefined }, 'consent'],
    ] as const) {
      const res = await book(ev.slug, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(Object.keys((await errorOf(res)).details!.fields!), JSON.stringify(body)).toContain(field);
    }
  });

  it('allows at most 10 places in one booking', async () => {
    const ev = await insertEvent({ max_participants: 30 });
    const res = await book(ev.slug, { participants: 11 });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('too_many_places');
    await created(await book(ev.slug, { participants: 10 }));
  });

  it('says how many places are left when asking for too many, and "sold out" when none', async () => {
    const ev = await insertEvent({ max_participants: 3 });
    await created(await book(ev.slug, { participants: 2 }));
    const tooMany = await book(ev.slug, { participants: 2 });
    expect(tooMany.status).toBe(409);
    const err = await errorOf(tooMany);
    expect(err.code).toBe('not_enough_places');
    expect(err.details?.remaining).toBe(1);
    expect(err.message).toContain('Only 1 place is left');

    await created(await book(ev.slug, { participants: 1 }));
    const soldOut = await book(ev.slug, { participants: 1 });
    expect(soldOut.status).toBe(409);
    expect((await errorOf(soldOut)).code).toBe('sold_out');
  });

  it('refuses drafts, unknown, cancelled, finished and already-started workshops', async () => {
    expect((await book((await insertEvent({ status: 'draft' })).slug)).status).toBe(404);
    expect((await book('no-such-workshop')).status).toBe(404);
    const cancelled = await book((await insertEvent({ status: 'cancelled' })).slug);
    expect(cancelled.status).toBe(409);
    expect((await errorOf(cancelled)).code).toBe('event_cancelled');
    const started = await book(
      (await insertEvent({ starts_at: new Date(Date.now() - 3600_000).toISOString(), ends_at: new Date(Date.now() + 3600_000).toISOString() })).slug,
    );
    expect(started.status).toBe(409);
    expect((await errorOf(started)).code).toBe('event_started');
    const done = await book((await insertEvent({ status: 'completed' })).slug);
    expect(done.status).toBe(409);
  });

  it('needs the human check (Turnstile)', async () => {
    const ev = await insertEvent();
    const res = await book(ev.slug, {}, { TURNSTILE_SECRET_KEY: '2x0000000000000000000000000000000AA' });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('turnstile_failed');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM event_bookings').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('is a clear 503, and reserves nothing, when payment is not configured', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    const res = await book(ev.slug, {}, { STRIPE_FAKE: undefined, STRIPE_SECRET_KEY: undefined });
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe('payments_not_configured');
    expect((await availability(ev.slug)).taken).toBe(0);
  });

  it('gives the places back at once when Stripe cannot start the payment', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 }));
    const res = await book(ev.slug, {}, { STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: undefined });
    expect(res.status).toBe(502);
    expect((await errorOf(res)).code).toBe('payment_unavailable');
    expect((await availability(ev.slug)).taken).toBe(0);
    expect((await env.DB.prepare(`SELECT booking_status FROM event_bookings`).first<{ booking_status: string }>())!.booking_status).toBe('expired');
  });

  it('in real mode returns the Stripe page and stores the session', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc' })));
    const res = await created(await book(ev.slug, {}, { STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: undefined }));
    expect(res.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_abc');
    expect((await rowByToken(res.bookingToken))!.stripe_checkout_session_id).toBe('cs_test_abc');
  });
});

describe('the last places (no overselling)', () => {
  it('parallel requests for the last 3 places: exactly 3 succeed, the rest are told it is sold out', async () => {
    const ev = await insertEvent({ max_participants: 3 });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => book(ev.slug, { participants: 1, email: `p${i}@example.com` })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    const row = await env.DB.prepare(`SELECT SUM(number_of_participants) AS n FROM event_bookings`).first<{ n: number }>();
    expect(row!.n).toBe(3);
  });

  it('parallel multi-place requests never exceed capacity', async () => {
    const ev = await insertEvent({ max_participants: 5 });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => book(ev.slug, { participants: 2, email: `q${i}@example.com` })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(2); // 2 x 2 = 4 of 5 places; a third pair would need 6
    const row = await env.DB.prepare(`SELECT SUM(number_of_participants) AS n FROM event_bookings`).first<{ n: number }>();
    expect(row!.n).toBeLessThanOrEqual(5);
  });

  it('a hold that ran out frees its places for someone else', async () => {
    const ev = await insertEvent({ max_participants: 2 });
    await insertBooking(ev.id, { participants: 2, booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await availability(ev.slug)).remaining).toBe(2);
    await created(await book(ev.slug, { participants: 2 }));
  });

  it('an unexpired hold keeps the places, and a confirmed booking always does', async () => {
    const ev = await insertEvent({ max_participants: 4 });
    await insertBooking(ev.id, { participants: 2, booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() + 600_000).toISOString() });
    await insertBooking(ev.id, { participants: 2, booking_status: 'confirmed' });
    expect((await book(ev.slug, { participants: 1 })).status).toBe(409);
    // expired, cancelled and refunded bookings never count
    await insertBooking(ev.id, { participants: 2, booking_status: 'cancelled', payment_status: 'refunded' });
    await insertBooking(ev.id, { participants: 2, booking_status: 'expired', payment_status: 'failed' });
    expect((await availability(ev.slug)).taken).toBe(4);
  });

  it('the cleanup job marks stale holds expired (and only those)', async () => {
    const ev = await insertEvent();
    const stale = await insertBooking(ev.id, { booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() - 60_000).toISOString() });
    const live = await insertBooking(ev.id, { booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() + 600_000).toISOString() });
    const confirmed = await insertBooking(ev.id);
    expect(await expireStaleHolds(testEnv())).toBe(1);
    const status = async (id: string) => (await env.DB.prepare('SELECT booking_status AS s FROM event_bookings WHERE id = ?1').bind(id).first<{ s: string }>())!.s;
    expect(await status(stale)).toBe('expired');
    expect(await status(live)).toBe('pending');
    expect(await status(confirmed)).toBe('confirmed');
    // the scheduled run does it too
    await env.DB.prepare(`UPDATE event_bookings SET hold_expires_at = ?2 WHERE id = ?1`).bind(live, new Date(Date.now() - 1000).toISOString()).run();
    await runScheduled(FREQUENT_CRON, testEnv());
    expect(await status(live)).toBe('expired');
  });
});

describe('booking a free workshop', () => {
  it('is confirmed at once with no payment, and both emails are queued', async () => {
    const ev = await insertEvent({ price_minor: 0, title: 'Open Studio' });
    const res = await created(await book(ev.slug, { participants: 3 }));
    expect(res.confirmed).toBe(true);
    expect(res.checkoutUrl).toBeUndefined();
    expect(await rowByToken(res.bookingToken)).toMatchObject({
      booking_status: 'confirmed',
      payment_status: 'paid',
      amount_minor: 0,
      hold_expires_at: null,
      stripe_checkout_session_id: null,
    });
    const mails = await outbox();
    expect(mails.map((m) => m.kind).sort()).toEqual(['booking_confirmation', 'booking_notification']);
    expect(mails.find((m) => m.kind === 'booking_confirmation')!.text_body).toContain('Free');
  });

  it('works even when payments are not configured, and respects capacity', async () => {
    const ev = await insertEvent({ price_minor: 0, max_participants: 2 });
    const off = { STRIPE_FAKE: undefined, STRIPE_SECRET_KEY: undefined };
    await created(await book(ev.slug, { participants: 2 }, off));
    const again = await book(ev.slug, { participants: 1 }, off);
    expect(again.status).toBe(409);
  });
});

describe('the booking status page endpoint', () => {
  const status = async (token: string, lang = 'en') => call(`/api/bookings/${token}?lang=${lang}`);

  it('reports a held booking as pending, then expired once the hold has run out', async () => {
    const ev = await insertEvent({ title: 'Evening Class', title_da: 'Aftenhold' });
    const t = await created(await book(ev.slug));
    const res = await status(t.bookingToken);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { emailHint: string };
    expect(body).toMatchObject({ status: 'pending', participants: 2, event: { slug: ev.slug, title: 'Evening Class' } });
    expect(body.emailHint).toBe('a***@example.com');
    expect(JSON.stringify(body)).not.toContain('anna@example.com');
    expect(JSON.stringify(body)).not.toContain('Anna');

    await env.DB.prepare(`UPDATE event_bookings SET hold_expires_at = ?1`).bind(new Date(Date.now() - 1000).toISOString()).run();
    expect(((await (await status(t.bookingToken)).json()) as { status: string }).status).toBe('expired');
    expect(((await (await status(t.bookingToken, 'da')).json()) as { event: { title: string } }).event.title).toBe('Aftenhold');
  });

  it('is a plain 404 for anything that is not a real token', async () => {
    expect((await status('x')).status).toBe(404);
    expect((await status('a'.repeat(30))).status).toBe(404);
    expect((await status("'; DROP TABLE event_bookings; --")).status).toBe(404);
  });
});

describe('the local pretend payment page', () => {
  const page = (id: string) => call(`/api/dev/stripe/checkout/${id}`);
  const act = (id: string, action: string, overrides: Record<string, unknown> = {}) =>
    call(`/api/dev/stripe/checkout/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `action=${action}` }, overrides);
  const idOf = (t: Created) => t.checkoutUrl!.split('/').pop()!;

  it('"Pay" confirms through the real handler, sends the emails and returns to the thank-you page', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    const t = await created(await book(ev.slug, { locale: 'da' }));
    const html = await (await page(idOf(t))).text();
    expect(html).toContain('Local test only');
    expect(html).toContain('DKK 1100.00');

    const res = await act(idOf(t), 'pay');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`http://localhost:3000/da/booking/success?token=${t.bookingToken}`);
    expect(await rowByToken(t.bookingToken)).toMatchObject({ booking_status: 'confirmed', payment_status: 'paid' });
    expect((await outbox()).map((m) => m.kind).sort()).toEqual(['booking_confirmation', 'booking_notification']);
  });

  it('"Go back" keeps the hold and "expire" releases it', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    const a = await created(await book(ev.slug));
    const back = await act(idOf(a), 'cancel');
    expect(back.headers.get('Location')).toContain('/booking/cancelled?token=');
    expect((await rowByToken(a.bookingToken))!.booking_status).toBe('pending');

    const exp = await act(idOf(a), 'expire');
    expect(exp.status).toBe(303);
    expect(await rowByToken(a.bookingToken)).toMatchObject({ booking_status: 'expired', payment_status: 'failed' });
    expect((await availability(ev.slug)).taken).toBe(0);
  });

  it('does not exist outside the local pretend mode', async () => {
    const ev = await insertEvent({ price_minor: 55000 });
    const t = await created(await book(ev.slug));
    expect((await call(`/api/dev/stripe/checkout/${idOf(t)}`, {}, { STRIPE_FAKE: undefined })).status).toBe(404);
    expect((await act(idOf(t), 'pay', { STRIPE_FAKE: undefined })).status).toBe(404);
    expect((await call(`/api/dev/stripe/checkout/${idOf(t)}`, {}, { APP_ENV: 'production' })).status).toBe(500); // refused by the config guard
    expect((await rowByToken(t.bookingToken))!.booking_status).toBe('pending');
  });
});
