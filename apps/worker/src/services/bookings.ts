import { localePath, type Locale } from '@flowart/shared';
import { holdMinutes, siteOrigin, stripeMode } from '../config';
import {
  customerCancellation,
  customerConfirmation,
  ownerAttentionAlert,
  ownerBookingNotification,
  bookingRef,
  type BookingMailData,
  type CancelReason,
} from '../email/booking';
import { enqueueEmail, flushOutbox } from '../email';
import type { Env } from '../env';
import { HttpError, notFound, nowIso, randomToken, uuid } from '../lib/http';
import { createCheckoutSession, createRefund, StripeError } from '../lib/stripe';
import type { BookingInput } from '../schemas';
import type { EventRow } from './events';

export interface BookingRow {
  id: string;
  event_id: string;
  public_token: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  locale: Locale;
  number_of_participants: number;
  amount_minor: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  booking_status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  needs_attention: number;
  attention_note: string | null;
  hold_expires_at: string | null;
  consent_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Places taken by OTHER bookings: confirmed, or still being paid inside their hold. */
const TAKEN_SQL = `COALESCE((SELECT SUM(o.number_of_participants) FROM event_bookings o
    WHERE o.event_id = e.id AND (o.booking_status = 'confirmed' OR (o.booking_status = 'pending' AND o.hold_expires_at > ?NOW))), 0)`;

export interface CreatedBooking {
  bookingToken: string;
  /** set for a paid workshop: send the browser here to pay */
  checkoutUrl?: string;
  /** set for a free workshop: the booking is already confirmed */
  confirmed?: boolean;
}

async function loadEventBySlug(env: Env, slug: string): Promise<EventRow | null> {
  return env.DB.prepare(`SELECT * FROM events WHERE slug = ?1 AND status IN ('published', 'cancelled', 'completed')`).bind(slug).first<EventRow>();
}

/**
 * Reserve places and, for a paid workshop, start the payment.
 *
 * The reservation is ONE conditional INSERT ... SELECT: the database only writes the row if, at that
 * very moment, the workshop is published, has not started and still has enough places. D1 has no
 * row locks, so this single statement is what stops two people taking the last place. The price is
 * read inside the same statement; nothing from the browser is used for money.
 */
export async function createBooking(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  slug: string,
  input: BookingInput,
): Promise<CreatedBooking> {
  const event = await loadEventBySlug(env, slug);
  if (!event) throw notFound('Workshop not found');
  if (event.status === 'cancelled') throw new HttpError(409, 'event_cancelled', 'This workshop has been cancelled.');
  if (event.status === 'completed' || Date.parse(event.starts_at) <= Date.now()) {
    throw new HttpError(409, 'event_started', 'This workshop has already started, so it can no longer be booked.');
  }
  const maxPer = Math.max(1, Number(env.BOOKING_MAX_PARTICIPANTS ?? '10') || 10);
  if (input.participants > maxPer) {
    throw new HttpError(400, 'too_many_places', `You can book at most ${maxPer} places at once.`, {
      fields: { participants: `You can book at most ${maxPer} places at once.` },
    });
  }
  // Fail early and clearly when a paid workshop cannot take payment (nothing is reserved).
  if (event.price_minor > 0 && stripeMode(env) === 'off') {
    throw new HttpError(503, 'payments_not_configured', 'Online payment is not available right now. Please contact us to book.');
  }

  const id = uuid();
  const token = randomToken();
  const now = nowIso();
  const hold = new Date(Date.now() + holdMinutes(env) * 60_000).toISOString();

  const inserted = await env.DB.prepare(
    `INSERT INTO event_bookings
       (id, event_id, public_token, customer_name, customer_email, customer_phone, locale, number_of_participants,
        amount_minor, currency, payment_status, booking_status, hold_expires_at, consent_accepted_at, created_at, updated_at)
     SELECT ?1, e.id, ?2, ?3, ?4, ?5, ?6, ?7,
            e.price_minor * ?7, e.currency,
            CASE WHEN e.price_minor = 0 THEN 'paid' ELSE 'pending' END,
            CASE WHEN e.price_minor = 0 THEN 'confirmed' ELSE 'pending' END,
            CASE WHEN e.price_minor = 0 THEN NULL ELSE ?8 END,
            ?9, ?9, ?9
       FROM events e
      WHERE e.id = ?10 AND e.status = 'published' AND e.starts_at > ?9
        AND e.max_participants - ${TAKEN_SQL.replace('?NOW', '?9')} >= ?7
     RETURNING id`,
  )
    .bind(id, token, input.name, input.email, input.phone, input.locale, input.participants, hold, now, event.id)
    .first<{ id: string }>();

  if (!inserted) {
    // Work out why, to tell the visitor something useful.
    const fresh = await loadEventBySlug(env, slug);
    if (!fresh || fresh.status !== 'published' || Date.parse(fresh.starts_at) <= Date.now()) {
      throw new HttpError(409, 'event_closed', 'This workshop can no longer be booked.');
    }
    const row = await env.DB.prepare(
      `SELECT e.max_participants - ${TAKEN_SQL.replace('?NOW', '?2')} AS remaining FROM events e WHERE e.id = ?1`,
    )
      .bind(event.id, now)
      .first<{ remaining: number }>();
    const remaining = Math.max(0, row?.remaining ?? 0);
    throw new HttpError(
      409,
      remaining === 0 ? 'sold_out' : 'not_enough_places',
      remaining === 0
        ? 'Sorry, this workshop has just sold out.'
        : `Only ${remaining} place${remaining === 1 ? ' is' : 's are'} left. Please choose fewer places.`,
      { remaining },
    );
  }

  // Free workshop: confirmed right away.
  if (event.price_minor === 0) {
    await notifyConfirmed(env, id);
    ctx.waitUntil(flushOutbox(env, { limit: 10 }));
    return { bookingToken: token, confirmed: true };
  }

  // Paid workshop: open the payment page. If that fails, give the places back at once.
  try {
    const origin = siteOrigin(env);
    const session = await createCheckoutSession(env, {
      bookingId: id,
      eventTitle: event.title,
      unitAmountMinor: event.price_minor,
      quantity: input.participants,
      currency: event.currency,
      customerEmail: input.email,
      locale: input.locale,
      successUrl: `${origin}${localePath(input.locale, '/booking/success')}?token=${token}`,
      cancelUrl: `${origin}${localePath(input.locale, '/booking/cancelled')}?token=${token}`,
      expiresAt: Math.floor(Date.parse(hold) / 1000) + 60,
    });
    await env.DB.prepare('UPDATE event_bookings SET stripe_checkout_session_id = ?2 WHERE id = ?1').bind(id, session.id).run();
    return { bookingToken: token, checkoutUrl: session.url };
  } catch (err) {
    await env.DB.prepare(
      `UPDATE event_bookings SET booking_status = 'expired', payment_status = 'failed' WHERE id = ?1 AND booking_status = 'pending'`,
    )
      .bind(id)
      .run();
    console.log(JSON.stringify({ level: 'error', msg: 'could not start checkout', booking: id, error: String(err) }));
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'payment_unavailable', 'We could not start the payment. Nothing was charged. Please try again in a moment.');
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function loadBookingById(env: Env, id: string): Promise<BookingRow | null> {
  return env.DB.prepare('SELECT * FROM event_bookings WHERE id = ?1').bind(id).first<BookingRow>();
}

export async function loadMailData(env: Env, bookingId: string): Promise<BookingMailData | null> {
  const booking = await loadBookingById(env, bookingId);
  if (!booking) return null;
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?1').bind(booking.event_id).first<EventRow>();
  if (!event) return null;
  return { booking, event };
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** What the "thank you" page may know. Minimal on purpose: the link itself is the only credential. */
export async function getBookingStatus(env: Env, token: string, lang: Locale) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound('Booking not found');
  const b = await env.DB.prepare('SELECT * FROM event_bookings WHERE public_token = ?1').bind(token).first<BookingRow>();
  if (!b) throw notFound('Booking not found');
  const e = await env.DB.prepare('SELECT * FROM events WHERE id = ?1').bind(b.event_id).first<EventRow>();
  if (!e) throw notFound('Booking not found');
  const held = b.booking_status === 'pending' && b.hold_expires_at !== null && b.hold_expires_at > nowIso();
  // A pending booking whose hold has run out is reported as expired even before the cleanup job runs.
  const status = b.booking_status === 'pending' && !held ? 'expired' : b.booking_status;
  const da = lang === 'da';
  return {
    status,
    paymentStatus: b.payment_status,
    reference: bookingRef(b.id),
    participants: b.number_of_participants,
    amountMinor: b.amount_minor,
    currency: b.currency,
    emailHint: maskEmail(b.customer_email),
    event: {
      slug: e.slug,
      title: da && e.title_da ? e.title_da : e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      timezone: e.timezone,
      location: (da && e.location_da ? e.location_da : e.location) ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// State changes. Every change is a guarded UPDATE ... RETURNING, so running one twice (a repeated
// webhook, a double click) changes nothing the second time and sends no second email.
// ---------------------------------------------------------------------------

/** Queue the confirmation mails (customer with calendar file, and the owner). */
export async function notifyConfirmed(env: Env, bookingId: string): Promise<void> {
  const data = await loadMailData(env, bookingId);
  if (!data) return;
  try {
    await enqueueEmail(env, customerConfirmation(env, data));
    await enqueueEmail(env, ownerBookingNotification(env, data));
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'could not queue booking emails', booking: bookingId, error: String(err) }));
  }
}

export async function notifyCancelled(env: Env, bookingId: string, reason: CancelReason, refunded: boolean): Promise<void> {
  const data = await loadMailData(env, bookingId);
  if (!data) return;
  try {
    await enqueueEmail(env, customerCancellation(env, data, { reason, refunded }));
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'could not queue cancellation email', booking: bookingId, error: String(err) }));
  }
}

/** Mark a booking for the owner's attention and tell them by email. */
export async function flagAttention(env: Env, bookingId: string, note: string): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE event_bookings SET needs_attention = 1, attention_note = ?2 WHERE id = ?1 AND (needs_attention = 0 OR attention_note IS NOT ?2) RETURNING id`,
  )
    .bind(bookingId, note)
    .first<{ id: string }>();
  if (!res) return;
  const data = await loadMailData(env, bookingId);
  if (data) {
    try {
      await enqueueEmail(env, ownerAttentionAlert(env, data, note));
    } catch {
      // the flag in the admin list is what matters
    }
  }
}

/**
 * A payment succeeded. Confirms the booking if it is still pending inside its hold, OR if the hold has
 * run out but the places are still free (so a slow payer is not punished for nothing).
 * Returns 'confirmed' (this call confirmed it), 'already' (it was already confirmed) or 'rejected'.
 */
export async function confirmPaid(env: Env, bookingId: string, paymentIntentId: string | null): Promise<'confirmed' | 'already' | 'rejected'> {
  const now = nowIso();
  const won = await env.DB.prepare(
    `UPDATE event_bookings
        SET booking_status = 'confirmed', payment_status = 'paid', hold_expires_at = NULL,
            stripe_payment_intent_id = COALESCE(?2, stripe_payment_intent_id)
      WHERE id = ?1 AND booking_status IN ('pending', 'expired')
        AND EXISTS (
          SELECT 1 FROM events e
           WHERE e.id = event_bookings.event_id AND e.status = 'published' AND e.starts_at > ?3
             AND (
               -- still inside its hold: the places are already ours
               (event_bookings.booking_status = 'pending' AND event_bookings.hold_expires_at > ?3)
               -- hold ran out: only if nobody else has taken the places meanwhile
               OR e.max_participants - COALESCE((SELECT SUM(o.number_of_participants) FROM event_bookings o
                     WHERE o.event_id = e.id AND o.id <> event_bookings.id
                       AND (o.booking_status = 'confirmed' OR (o.booking_status = 'pending' AND o.hold_expires_at > ?3))), 0)
                  >= event_bookings.number_of_participants
             )
        )
      RETURNING id`,
  )
    .bind(bookingId, paymentIntentId, now)
    .first<{ id: string }>();
  if (won) return 'confirmed';
  const row = await loadBookingById(env, bookingId);
  return row?.booking_status === 'confirmed' && row.payment_status === 'paid' ? 'already' : 'rejected';
}

export type RefundOutcome = 'refunded' | 'cancelled_free' | 'already' | 'failed' | 'not_refundable';

/**
 * Cancel a booking and, if it was paid, refund it in full. Used by the admin "Cancel and refund", by
 * event cancellation and for a payment that arrived too late. Safe to repeat.
 */
export async function cancelAndRefund(
  env: Env,
  bookingId: string,
  reason: CancelReason,
): Promise<{ outcome: RefundOutcome; message?: string }> {
  const b = await loadBookingById(env, bookingId);
  if (!b) throw notFound('Booking not found');
  if (b.payment_status === 'refunded' || b.booking_status === 'cancelled') return { outcome: 'already' };

  const paid = b.payment_status === 'paid' && b.amount_minor > 0;
  if (!paid) {
    if (b.booking_status !== 'confirmed') return { outcome: 'not_refundable', message: 'This booking is not confirmed.' };
    // Free booking: nothing to refund, just release the places.
    const done = await env.DB.prepare(
      `UPDATE event_bookings SET booking_status = 'cancelled' WHERE id = ?1 AND booking_status = 'confirmed' RETURNING id`,
    )
      .bind(bookingId)
      .first<{ id: string }>();
    if (done) await notifyCancelled(env, bookingId, reason, false);
    return { outcome: done ? 'cancelled_free' : 'already' };
  }

  if (!b.stripe_payment_intent_id) {
    await flagAttention(env, bookingId, 'Paid, but there is no Stripe payment to refund automatically. Refund it in the Stripe dashboard.');
    return { outcome: 'failed', message: 'No Stripe payment is recorded for this booking.' };
  }
  try {
    await createRefund(env, b.id, b.stripe_payment_intent_id);
  } catch (err) {
    const message = err instanceof StripeError ? err.message : 'The refund failed.';
    console.log(JSON.stringify({ level: 'error', msg: 'refund failed', booking: bookingId, error: String(err) }));
    await flagAttention(env, bookingId, `The automatic refund failed (${message}). Refund it in the Stripe dashboard, then mark it handled.`);
    return { outcome: 'failed', message };
  }
  const done = await env.DB.prepare(
    `UPDATE event_bookings SET payment_status = 'refunded', booking_status = 'cancelled', hold_expires_at = NULL, needs_attention = 0, attention_note = NULL
      WHERE id = ?1 AND payment_status = 'paid' RETURNING id`,
  )
    .bind(bookingId)
    .first<{ id: string }>();
  if (done) await notifyCancelled(env, bookingId, reason, true);
  return { outcome: done ? 'refunded' : 'already' };
}

/** Cron: pending bookings whose hold has run out become expired (their places were already free). */
export async function expireStaleHolds(env: Env): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE event_bookings SET booking_status = 'expired', payment_status = 'failed'
      WHERE booking_status = 'pending' AND hold_expires_at <= ?1 RETURNING id`,
  )
    .bind(nowIso())
    .all<{ id: string }>();
  return res.results.length;
}
