import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signWebhookPayload } from '../src/lib/stripe';
import { call, insertBooking, insertEvent, WEBHOOK_SECRET } from './helpers';
import { book, created, outbox, rowByToken } from './booking-helpers';

afterEach(() => vi.restoreAllMocks());

let n = 0;
const sessionFor = (b: { id: string; sessionId: string }, extra: Record<string, unknown> = {}) => ({
  id: b.sessionId,
  client_reference_id: b.id,
  payment_status: 'paid',
  amount_total: 110000,
  currency: 'dkk',
  payment_intent: `pi_test_${b.id.slice(0, 8)}`,
  ...extra,
});

async function webhook(type: string, object: Record<string, unknown>, opts: { id?: string; secret?: string; at?: number; overrides?: Record<string, unknown> } = {}) {
  const payload = JSON.stringify({ id: opts.id ?? `evt_${++n}`, type, data: { object } });
  const signature = await signWebhookPayload(opts.secret ?? WEBHOOK_SECRET, payload, opts.at);
  return call('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': signature, 'Content-Type': 'application/json' }, body: payload }, opts.overrides);
}

/** A pending paid booking made through the real endpoint (2 places x 550 = 1100). */
async function pendingBooking(extra: { max?: number; locale?: string } = {}) {
  const ev = await insertEvent({ price_minor: 55000, max_participants: extra.max ?? 8, title: 'Oil Painting', title_da: 'Oliemaleri' });
  const t = await created(await book(ev.slug, { locale: extra.locale ?? 'en' }));
  const row = (await rowByToken(t.bookingToken))!;
  return { ev, token: t.bookingToken, id: String(row.id), sessionId: String(row.stripe_checkout_session_id) };
}

const state = async (token: string) => {
  const r = (await rowByToken(token))!;
  return { booking: r.booking_status, payment: r.payment_status, attention: r.needs_attention, pi: r.stripe_payment_intent_id };
};

describe('webhook endpoint security', () => {
  it('rejects a missing, wrong or stale signature and a body that is not JSON', async () => {
    const b = await pendingBooking();
    const object = sessionFor(b);
    const payload = JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object } });
    const send = (sig: string | null, body = payload) =>
      call('/api/stripe/webhook', { method: 'POST', headers: sig ? { 'Stripe-Signature': sig } : {}, body });
    expect((await send(null)).status).toBe(400);
    expect((await send(await signWebhookPayload('whsec_wrong', payload))).status).toBe(400);
    expect((await send(await signWebhookPayload(WEBHOOK_SECRET, payload, Math.floor(Date.now() / 1000) - 3600))).status).toBe(400);
    expect((await send(await signWebhookPayload(WEBHOOK_SECRET, payload + ' '), payload)).status).toBe(400); // body changed after signing
    const notJson = 'not json';
    expect((await send(await signWebhookPayload(WEBHOOK_SECRET, notJson), notJson)).status).toBe(400);
    const notEvent = '{"hello":1}';
    expect((await send(await signWebhookPayload(WEBHOOK_SECRET, notEvent), notEvent)).status).toBe(400);
    expect((await state(b.token)).booking).toBe('pending'); // nothing changed
  });

  it('is a 503 when the signing secret is not configured', async () => {
    const res = await webhook('checkout.session.completed', {}, { overrides: { STRIPE_WEBHOOK_SECRET: 'whsec_xxx' } });
    expect(res.status).toBe(503);
  });

  it('acknowledges event types it does not use', async () => {
    const res = await webhook('customer.created', { id: 'cus_1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, outcome: 'ignored' });
  });
});

describe('payment completed', () => {
  it('confirms the booking, stores the payment and sends the customer and owner emails once', async () => {
    const b = await pendingBooking();
    const res = await webhook('checkout.session.completed', sessionFor(b));
    expect(res.status).toBe(200);
    expect(await state(b.token)).toMatchObject({ booking: 'confirmed', payment: 'paid', pi: `pi_test_${b.id.slice(0, 8)}` });
    expect((await rowByToken(b.token))!.hold_expires_at).toBeNull();
    const mails = await outbox();
    expect(mails.map((m) => m.kind).sort()).toEqual(['booking_confirmation', 'booking_notification']);
    expect(mails.find((m) => m.kind === 'booking_confirmation')!.to_email).toBe('anna@example.com');
    expect(mails.find((m) => m.kind === 'booking_notification')!.to_email).toBe('info@zfadavi.com');
  });

  it('a repeated delivery of the same event changes and sends nothing more', async () => {
    const b = await pendingBooking();
    const first = await webhook('checkout.session.completed', sessionFor(b), { id: 'evt_same' });
    expect(((await first.json()) as { outcome: string }).outcome).toBe('handled');
    const again = await webhook('checkout.session.completed', sessionFor(b), { id: 'evt_same' });
    expect(((await again.json()) as { outcome: string }).outcome).toBe('duplicate');
    // a different event id for the same payment is harmless too
    await webhook('checkout.session.completed', sessionFor(b), { id: 'evt_other' });
    expect(await outbox()).toHaveLength(2);
    expect((await state(b.token)).booking).toBe('confirmed');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM stripe_events').first<{ n: number }>())!.n).toBe(2);
  });

  it('does not confirm when the amount or currency differs; it flags the booking for the owner', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(b, { amount_total: 100 }));
    expect(await state(b.token)).toMatchObject({ booking: 'pending', attention: 1 });
    expect((await outbox()).map((m) => m.kind)).toEqual(['booking_attention']);

    const c = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(c, { currency: 'eur' }));
    expect((await state(c.token)).attention).toBe(1);
    expect((await state(c.token)).booking).toBe('pending');
  });

  it('ignores a session that is not ours, unpaid sessions and a wrong session for the booking', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor({ id: b.id, sessionId: 'cs_someone_else' }));
    await webhook('checkout.session.completed', sessionFor({ id: 'no-such-booking', sessionId: b.sessionId }));
    await webhook('checkout.session.completed', sessionFor(b, { payment_status: 'unpaid' }));
    expect((await state(b.token)).booking).toBe('pending');
    expect(await outbox()).toHaveLength(0);
  });

  it('a payment arriving just after the hold ran out is still accepted when the places are free', async () => {
    const b = await pendingBooking();
    await env.DB.prepare(`UPDATE event_bookings SET hold_expires_at = ?1`).bind(new Date(Date.now() - 60_000).toISOString()).run();
    await webhook('checkout.session.completed', sessionFor(b));
    expect((await state(b.token)).booking).toBe('confirmed');
  });

  it('a payment arriving after the cleanup job expired it is accepted too (events can arrive in any order)', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.expired', { id: b.sessionId, client_reference_id: b.id });
    expect((await state(b.token)).booking).toBe('expired');
    await webhook('checkout.session.completed', sessionFor(b));
    expect(await state(b.token)).toMatchObject({ booking: 'confirmed', payment: 'paid' });
  });

  it('a late payment is refunded automatically when someone else took the places; the customer is told', async () => {
    const b = await pendingBooking({ max: 2 });
    await env.DB.prepare(`UPDATE event_bookings SET hold_expires_at = ?1`).bind(new Date(Date.now() - 60_000).toISOString()).run();
    await created(await book(b.ev.slug, { participants: 2, email: 'other@example.com' })); // takes both places
    await webhook('checkout.session.completed', sessionFor(b));
    expect(await state(b.token)).toMatchObject({ booking: 'cancelled', payment: 'refunded', attention: 0 });
    const mail = (await outbox()).find((m) => m.kind === 'booking_cancelled')!;
    expect(mail.to_email).toBe('anna@example.com');
    expect(mail.subject).toContain('refunded');
  });

  it('a payment for a workshop that was cancelled meanwhile is refunded automatically', async () => {
    const b = await pendingBooking();
    await env.DB.prepare(`UPDATE events SET status = 'cancelled'`).run();
    await webhook('checkout.session.completed', sessionFor(b));
    expect(await state(b.token)).toMatchObject({ booking: 'cancelled', payment: 'refunded' });
  });

  it('if the automatic refund of a late payment fails, the owner is alerted and the money is not forgotten', async () => {
    const b = await pendingBooking();
    await env.DB.prepare(`UPDATE events SET status = 'cancelled'`).run();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'insufficient funds' } }), { status: 402 }));
    await webhook('checkout.session.completed', sessionFor(b), { overrides: { STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: undefined } });
    expect(await state(b.token)).toMatchObject({ payment: 'paid', attention: 1 });
    expect((await outbox()).map((m) => m.kind)).toContain('booking_attention');
  });
});

describe('checkout expired and refunds', () => {
  it('an expired payment page releases the unpaid booking', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.expired', { id: b.sessionId, client_reference_id: b.id });
    expect(await state(b.token)).toMatchObject({ booking: 'expired', payment: 'failed' });
    expect(await outbox()).toHaveLength(0);
  });

  it('an expired event never undoes a paid booking', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(b));
    await webhook('checkout.session.expired', { id: b.sessionId, client_reference_id: b.id });
    expect(await state(b.token)).toMatchObject({ booking: 'confirmed', payment: 'paid' });
  });

  it('a full refund made in the Stripe dashboard cancels the booking, frees the places and tells the customer once', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(b));
    const charge = { id: 'ch_1', payment_intent: `pi_test_${b.id.slice(0, 8)}`, refunded: true, amount_refunded: 110000 };
    await webhook('charge.refunded', charge);
    await webhook('charge.refunded', charge);
    expect(await state(b.token)).toMatchObject({ booking: 'cancelled', payment: 'refunded' });
    expect((await outbox()).filter((m) => m.kind === 'booking_cancelled')).toHaveLength(1);
    expect(((await (await call(`/api/events/${b.ev.slug}/availability`)).json()) as { taken: number }).taken).toBe(0);
  });

  it('a partial refund is left alone', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(b));
    await webhook('charge.refunded', { id: 'ch_1', payment_intent: `pi_test_${b.id.slice(0, 8)}`, refunded: false, amount_refunded: 5000 });
    expect((await state(b.token)).booking).toBe('confirmed');
  });

  it('a refund for a payment we do not know is ignored', async () => {
    const ev = await insertEvent();
    await insertBooking(ev.id, { payment_intent: 'pi_known' });
    const res = await webhook('charge.refunded', { id: 'ch_x', payment_intent: 'pi_unknown', refunded: true });
    expect(res.status).toBe(200);
  });
});

describe('emails', () => {
  it('the customer gets their own language, the Copenhagen time, the cancellation rule and a calendar file', async () => {
    const b = await pendingBooking({ locale: 'da' });
    await webhook('checkout.session.completed', sessionFor(b));
    const mail = (await outbox()).find((m) => m.kind === 'booking_confirmation')!;
    expect(mail.subject).toBe('Din plads til Oliemaleri er booket');
    expect(mail.text_body).toContain('Hej Anna Jensen,');
    expect(mail.text_body).toContain('10.00'); // 2030-05-10 08:00 UTC is 10:00 in Copenhagen; Danish writes a dot
    expect(mail.text_body).toContain('24 timer');
    expect(mail.text_body).toContain(b.id.slice(0, 8).toUpperCase());
    expect(mail.text_body).not.toMatch(/moms|vat/i);
    const att = (JSON.parse(mail.attachments_json!) as Array<{ filename: string; content: string }>)[0]!;
    expect(att.filename).toMatch(/\.ics$/);
    const ics = new TextDecoder().decode(Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0)));
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20300510T080000Z');
    expect(ics).toContain('SUMMARY:Oliemaleri');
  });

  it('English customers get English, with the 24-hour rule', async () => {
    const b = await pendingBooking();
    await webhook('checkout.session.completed', sessionFor(b));
    const mail = (await outbox()).find((m) => m.kind === 'booking_confirmation')!;
    expect(mail.subject).toBe('Your place at Oil Painting is booked');
    expect(mail.text_body).toContain('at least 24 hours before');
    expect(mail.text_body).toContain('10:00');
  });

  it('the owner email is English, replies go to the customer, and names are escaped in the HTML part', async () => {
    const ev = await insertEvent({ price_minor: 0 });
    await created(await book(ev.slug, { name: '<script>alert(1)</script> Eve', email: 'eve@example.com', locale: 'da' }));
    const owner = (await outbox()).find((m) => m.kind === 'booking_notification')!;
    expect(owner.reply_to).toBe('eve@example.com');
    expect(owner.subject).toContain('New booking');
    expect(owner.html_body).not.toContain('<script>');
    expect(owner.html_body).toContain('&lt;script&gt;');
    const cust = (await outbox()).find((m) => m.kind === 'booking_confirmation')!;
    expect(cust.html_body).not.toContain('<script>');
  });
});
