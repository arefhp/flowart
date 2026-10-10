import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvCell } from '../src/services/bookings-admin';
import { FREQUENT_CRON, runScheduled } from '../src/scheduled';
import { errorOf, outbox } from './booking-helpers';
import { adminJson, call, insertBooking, insertEvent, testEnv } from './helpers';

afterEach(() => vi.restoreAllMocks());

const REAL = { STRIPE_SECRET_KEY: 'sk_test_realvalue1234567890', STRIPE_FAKE: undefined };
type B = { id: string; booking_status: string; payment_status: string; needs_attention: boolean; customer_name: string; outcome?: string };
const list = async (query = '') => ((await (await call(`/api/admin/bookings${query}`)).json()) as { bookings: B[] }).bookings;
const paid = (eventId: string, extra: Parameters<typeof insertBooking>[1] = {}) =>
  insertBooking(eventId, { payment_intent: `pi_${Math.random().toString(36).slice(2, 10)}`, ...extra });
const status = async (id: string) => (await env.DB.prepare('SELECT booking_status AS b, payment_status AS p, needs_attention AS a FROM event_bookings WHERE id = ?1').bind(id).first<{ b: string; p: string; a: number }>())!;
const stripeOk = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: 're_ok' })));

describe('admin bookings list', () => {
  it('lists bookings with their workshop, newest first, and filters by workshop, status and attention', async () => {
    const a = await insertEvent({ title: 'Workshop A' });
    const b = await insertEvent({ title: 'Workshop B' });
    await insertBooking(a.id, { name: 'Ann' });
    await insertBooking(b.id, { name: 'Bo', booking_status: 'cancelled', payment_status: 'refunded' });
    const flagged = await insertBooking(b.id, { name: 'Cy' });
    await env.DB.prepare('UPDATE event_bookings SET needs_attention = 1, attention_note = ?2 WHERE id = ?1').bind(flagged, 'look').run();

    const all = await list();
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ event_title: expect.any(String), reference: expect.stringMatching(/^[0-9A-F]{8}$/) });
    expect((await list(`?event=${a.id}`)).map((x) => x.customer_name)).toEqual(['Ann']);
    expect((await list('?status=cancelled')).map((x) => x.customer_name)).toEqual(['Bo']);
    expect((await list('?attention=1')).map((x) => x.customer_name)).toEqual(['Cy']);
    expect(await list('?status=nonsense')).toHaveLength(3); // an unknown status is ignored, not an error
  });

  it('shows one booking and 404s for an unknown one', async () => {
    const ev = await insertEvent();
    const id = await insertBooking(ev.id);
    expect(((await (await call(`/api/admin/bookings/${id}`)).json()) as B).id).toBe(id);
    expect((await call('/api/admin/bookings/nope')).status).toBe(404);
  });
});

describe('CSV export', () => {
  it('downloads a spreadsheet-friendly file and records the export', async () => {
    const ev = await insertEvent({ title: 'Oil, "Beginners"' });
    await insertBooking(ev.id, { name: 'Ann Jensen', email: 'ann@example.com' });
    const res = await call('/api/admin/bookings/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('bookings.csv');
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // byte-order mark so Excel reads the accents right
    const text = await res.text();
    expect(text.startsWith('Reference,Workshop')).toBe(true);
    expect(text).toContain('"Oil, ""Beginners"""');
    expect(text).toContain('ann@example.com');
    expect(text).toContain('450.00');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'booking.export'`).first<{ n: number }>())!.n).toBe(1);
  });

  it('cannot be used to run a formula in Excel or Sheets', async () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(null)).toBe('');
    const ev = await insertEvent();
    await insertBooking(ev.id, { name: '=1+1', email: 'x@example.com' });
    expect(await (await call('/api/admin/bookings/export.csv')).text()).toContain(",'=1+1,");
  });

  it('respects the same filters as the list', async () => {
    const a = await insertEvent({ title: 'Only A' });
    const b = await insertEvent({ title: 'Only B' });
    await insertBooking(a.id);
    await insertBooking(b.id);
    const text = await (await call(`/api/admin/bookings/export.csv?event=${a.id}`)).text();
    expect(text).toContain('Only A');
    expect(text).not.toContain('Only B');
  });
});

describe('cancelling one booking (refund)', () => {
  it('refunds a paid booking in full, frees the places, emails the customer and records it', async () => {
    const ev = await insertEvent({ max_participants: 4 });
    const id = await paid(ev.id, { participants: 2, email: 'ann@example.com' });
    const spy = stripeOk();
    const res = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST', undefined, REAL);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ booking_status: 'cancelled', payment_status: 'refunded', outcome: 'refunded' });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/refunds');
    expect(((init as RequestInit).headers as Record<string, string>)['Idempotency-Key']).toBe(`refund-${id}`);
    const mail = (await outbox()).find((m) => m.kind === 'booking_cancelled')!;
    expect(mail.to_email).toBe('ann@example.com');
    expect(mail.text_body).toContain('refunded');
    expect(((await (await call(`/api/events/${ev.slug}/availability`)).json()) as { taken: number }).taken).toBe(0);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'booking.cancel'`).first<{ n: number }>())!.n).toBe(1);
  });

  it('doing it twice refunds once', async () => {
    const ev = await insertEvent();
    const id = await paid(ev.id);
    const spy = stripeOk();
    await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST', undefined, REAL);
    const again = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST', undefined, REAL);
    expect(((await again.json()) as B).outcome).toBe('already');
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await outbox()).filter((m) => m.kind === 'booking_cancelled')).toHaveLength(1);
  });

  it('a free booking is just cancelled, with no payment call and no refund wording', async () => {
    const ev = await insertEvent({ price_minor: 0 });
    const id = await insertBooking(ev.id, { amount_minor: 0 });
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST', undefined, REAL);
    expect(((await res.json()) as B).outcome).toBe('cancelled_free');
    expect(spy).not.toHaveBeenCalled();
    const mail = (await outbox()).find((m) => m.kind === 'booking_cancelled')!;
    expect(mail.text_body).toContain('did not pay anything');
    expect((await status(id)).b).toBe('cancelled');
  });

  it('a booking still waiting for payment cannot be cancelled by hand', async () => {
    const ev = await insertEvent();
    const id = await insertBooking(ev.id, { booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() + 600_000).toISOString() });
    const res = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST');
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('still_pending');
  });

  it('when Stripe refuses the refund the booking stays paid, is flagged, and the owner is told', async () => {
    const ev = await insertEvent();
    const id = await paid(ev.id);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'charge already refunded' } }), { status: 400 }));
    const res = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST', undefined, REAL);
    expect(res.status).toBe(502);
    expect((await errorOf(res)).code).toBe('refund_failed');
    expect(await status(id)).toMatchObject({ b: 'confirmed', p: 'paid', a: 1 });
    expect((await outbox()).map((m) => m.kind)).toEqual(['booking_attention']);

    const handled = await adminJson(`/api/admin/bookings/${id}/handled`, 'POST');
    expect(((await handled.json()) as B).needs_attention).toBe(false);
  });

  it('a paid booking with no recorded Stripe payment is flagged instead of silently cancelled', async () => {
    const ev = await insertEvent();
    const id = await insertBooking(ev.id); // paid, but no payment_intent
    const res = await adminJson(`/api/admin/bookings/${id}/cancel`, 'POST');
    expect(res.status).toBe(502);
    expect((await status(id)).a).toBe(1);
  });
});

describe('cancelling a workshop that has bookings', () => {
  const cancel = (id: string, body: unknown = {}, overrides: Record<string, unknown> = {}) => adminJson(`/api/admin/events/${id}/cancel`, 'POST', body, overrides);

  it('asks first, with the numbers, and changes nothing until confirmed', async () => {
    const ev = await insertEvent();
    await paid(ev.id, { participants: 2 });
    await paid(ev.id, { participants: 1 });
    await insertBooking(ev.id, { booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() + 600_000).toISOString() });
    const res = await cancel(ev.id);
    expect(res.status).toBe(409);
    const err = (await res.json()) as { error: { code: string; details: Record<string, unknown> } };
    expect(err.error.code).toBe('confirmation_required');
    expect(err.error.details).toMatchObject({ confirmedBookings: 2, confirmedPlaces: 3, paidBookings: 2, refundMinor: 135000, currency: 'DKK', pendingHolds: 1 });
    expect((await env.DB.prepare('SELECT status FROM events WHERE id = ?1').bind(ev.id).first<{ status: string }>())!.status).toBe('published');
    expect(await outbox()).toHaveLength(0);
  });

  it('once confirmed it cancels, releases unpaid holds, refunds every paid booking and emails everyone', async () => {
    const ev = await insertEvent();
    const p1 = await paid(ev.id, { email: 'a@example.com', locale: 'da' });
    const p2 = await paid(ev.id, { email: 'b@example.com' });
    const free = await insertBooking(ev.id, { amount_minor: 0, email: 'c@example.com' });
    const pending = await insertBooking(ev.id, { booking_status: 'pending', payment_status: 'pending', hold_expires_at: new Date(Date.now() + 600_000).toISOString() });
    const spy = stripeOk();

    const res = await cancel(ev.id, { confirm: true }, REAL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; refunds: { done: number; failed: number; remaining: number } };
    expect(body.status).toBe('cancelled');
    expect(body.refunds).toEqual({ done: 3, failed: 0, remaining: 0 });
    expect(spy).toHaveBeenCalledTimes(2); // only the two paid ones touch Stripe

    expect(await status(p1)).toMatchObject({ b: 'cancelled', p: 'refunded' });
    expect(await status(p2)).toMatchObject({ b: 'cancelled', p: 'refunded' });
    expect((await status(free)).b).toBe('cancelled');
    expect((await status(pending)).b).toBe('expired');

    const mails = (await outbox()).filter((m) => m.kind === 'booking_cancelled');
    expect(mails.map((m) => m.to_email).sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
    expect(mails.find((m) => m.to_email === 'a@example.com')!.subject).toContain('aflyst'); // Danish customer, Danish mail
    expect(mails.find((m) => m.to_email === 'b@example.com')!.text_body).toContain('had to cancel the workshop');
  });

  it('with no bookings it cancels straight away, no question asked', async () => {
    const ev = await insertEvent();
    const res = await cancel(ev.id);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('cancelled');
  });

  it('refunds a large workshop a batch at a time; the scheduled job finishes the rest', async () => {
    const ev = await insertEvent({ max_participants: 40 });
    const ids: string[] = [];
    for (let i = 0; i < 13; i++) ids.push(await paid(ev.id));
    stripeOk();
    const first = (await (await cancel(ev.id, { confirm: true }, REAL)).json()) as { refunds: { done: number; remaining: number } };
    expect(first.refunds).toEqual({ done: 10, failed: 0, remaining: 3, ...{} });
    await runScheduled(FREQUENT_CRON, testEnv(REAL));
    const states = await Promise.all(ids.map(status));
    expect(states.every((s) => s.b === 'cancelled' && s.p === 'refunded')).toBe(true);
    expect((await outbox()).filter((m) => m.kind === 'booking_cancelled')).toHaveLength(13);
  });

  it('one failing refund is flagged and does not block the others, and is not retried forever', async () => {
    const ev = await insertEvent();
    const bad = await paid(ev.id, { payment_intent: 'pi_bad' });
    const good = await paid(ev.id, { payment_intent: 'pi_good' });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = String((init as RequestInit).body);
      return body.includes('pi_bad') ? new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 }) : new Response(JSON.stringify({ id: 're_ok' }));
    });
    const res = await cancel(ev.id, { confirm: true }, REAL);
    expect(((await res.json()) as { refunds: unknown }).refunds).toEqual({ done: 1, failed: 1, remaining: 0 });
    expect(await status(good)).toMatchObject({ b: 'cancelled', p: 'refunded' });
    expect(await status(bad)).toMatchObject({ b: 'confirmed', p: 'paid', a: 1 });
    const calls = spy.mock.calls.length;
    await runScheduled(FREQUENT_CRON, testEnv(REAL)); // flagged bookings are left for the owner
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('a workshop cancelled the old way (or by hand) is still refunded by the scheduled job', async () => {
    const ev = await insertEvent({ status: 'cancelled' });
    const id = await paid(ev.id);
    stripeOk();
    await runScheduled(FREQUENT_CRON, testEnv(REAL));
    expect((await status(id)).p).toBe('refunded');
  });

  it('a cancelled workshop cannot be booked, and its refund can be continued from the admin', async () => {
    const ev = await insertEvent();
    for (let i = 0; i < 12; i++) await paid(ev.id);
    stripeOk();
    await cancel(ev.id, { confirm: true }, REAL);
    const more = await adminJson(`/api/admin/events/${ev.id}/refunds`, 'POST', undefined, REAL);
    expect(await more.json()).toEqual({ done: 2, failed: 0, remaining: 0 });
  });
});
