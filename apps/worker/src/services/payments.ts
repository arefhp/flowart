import type { Env } from '../env';
import { nowIso } from '../lib/http';
import {
  cancelAndRefund,
  confirmPaid,
  flagAttention,
  loadBookingById,
  notifyCancelled,
  notifyConfirmed,
  type BookingRow,
} from './bookings';

/** The few fields we read from a Stripe event. Everything else is ignored. */
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export type WebhookOutcome = 'handled' | 'duplicate' | 'ignored';

/**
 * Apply one verified Stripe event. Stripe may send the same event more than once, in any order, and
 * the browser's "thank you" page is never trusted: only this function marks a booking paid.
 * Each step is a guarded database update, so repeating an event changes nothing. The event id is
 * recorded only AFTER it was handled, so a failure part-way is retried by Stripe.
 */
export async function handleStripeEvent(env: Env, evt: StripeEvent): Promise<WebhookOutcome> {
  const seen = await env.DB.prepare('SELECT 1 AS x FROM stripe_events WHERE id = ?1').bind(evt.id).first();
  if (seen) return 'duplicate';

  let outcome: WebhookOutcome = 'ignored';
  const object = evt.data.object;
  switch (evt.type) {
    case 'checkout.session.completed':
      outcome = await onCheckoutCompleted(env, object);
      break;
    case 'checkout.session.expired':
      outcome = await onCheckoutExpired(env, object);
      break;
    case 'charge.refunded':
      outcome = await onChargeRefunded(env, object);
      break;
    default:
      break; // other event types are acknowledged and ignored
  }

  await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, processed_at) VALUES (?1, ?2, ?3)')
    .bind(evt.id, evt.type.slice(0, 100), nowIso())
    .run();
  return outcome;
}

async function bookingForSession(env: Env, object: Record<string, unknown>): Promise<BookingRow | null> {
  const sessionId = str(object.id);
  const bookingId = str(object.client_reference_id) ?? str((object.metadata as Record<string, unknown> | undefined)?.booking_id);
  if (!sessionId || !bookingId) return null;
  const b = await loadBookingById(env, bookingId);
  // The session must be the one we created for this booking.
  return b && b.stripe_checkout_session_id === sessionId ? b : null;
}

async function onCheckoutCompleted(env: Env, session: Record<string, unknown>): Promise<WebhookOutcome> {
  const booking = await bookingForSession(env, session);
  if (!booking) {
    console.log(JSON.stringify({ level: 'warn', msg: 'stripe event for an unknown booking', session: str(session.id) }));
    return 'ignored';
  }
  // Only a completed payment counts (card and wallet payments are paid at this point).
  if (str(session.payment_status) !== 'paid') return 'ignored';

  const paymentIntent = str(session.payment_intent);
  const amount = num(session.amount_total);
  const currency = str(session.currency);
  if (amount !== booking.amount_minor || currency?.toLowerCase() !== booking.currency.toLowerCase()) {
    // The customer paid something other than what we expected. Never confirm automatically.
    await env.DB.prepare('UPDATE event_bookings SET stripe_payment_intent_id = COALESCE(?2, stripe_payment_intent_id) WHERE id = ?1')
      .bind(booking.id, paymentIntent)
      .run();
    await flagAttention(env, booking.id, 'The amount paid in Stripe does not match this booking. Check the payment in the Stripe dashboard.');
    return 'handled';
  }

  const result = await confirmPaid(env, booking.id, paymentIntent);
  if (result === 'confirmed') {
    await notifyConfirmed(env, booking.id);
    return 'handled';
  }
  if (result === 'already') return 'handled';

  // Paid, but the places cannot be given any more (the hold ran out and someone else took them, or the
  // workshop was cancelled or started). Give the money back automatically.
  await env.DB.prepare(
    `UPDATE event_bookings SET payment_status = 'paid', stripe_payment_intent_id = COALESCE(?2, stripe_payment_intent_id)
      WHERE id = ?1 AND booking_status <> 'confirmed'`,
  )
    .bind(booking.id, paymentIntent)
    .run();
  // if the refund fails, cancelAndRefund flags the booking for the owner
  await cancelAndRefund(env, booking.id, 'late_payment');
  return 'handled';
}

async function onCheckoutExpired(env: Env, session: Record<string, unknown>): Promise<WebhookOutcome> {
  const booking = await bookingForSession(env, session);
  if (!booking) return 'ignored';
  // Only an unpaid booking expires. A paid one is never touched by this event.
  await env.DB.prepare(
    `UPDATE event_bookings SET booking_status = 'expired', payment_status = 'failed'
      WHERE id = ?1 AND booking_status = 'pending' AND payment_status = 'pending'`,
  )
    .bind(booking.id)
    .run();
  return 'handled';
}

async function onChargeRefunded(env: Env, charge: Record<string, unknown>): Promise<WebhookOutcome> {
  const paymentIntent = str(charge.payment_intent);
  if (!paymentIntent) return 'ignored';
  const b = await env.DB.prepare('SELECT * FROM event_bookings WHERE stripe_payment_intent_id = ?1').bind(paymentIntent).first<BookingRow>();
  if (!b) return 'ignored';
  if (charge.refunded !== true) return 'ignored'; // a partial refund is left for the owner to handle in Stripe
  const done = await env.DB.prepare(
    `UPDATE event_bookings SET payment_status = 'refunded', booking_status = 'cancelled', hold_expires_at = NULL, needs_attention = 0, attention_note = NULL
      WHERE id = ?1 AND payment_status <> 'refunded' RETURNING id`,
  )
    .bind(b.id)
    .first<{ id: string }>();
  // Refunded from the Stripe dashboard (not by this app): tell the customer once.
  if (done) await notifyCancelled(env, b.id, 'admin', true);
  return done ? 'handled' : 'duplicate';
}
