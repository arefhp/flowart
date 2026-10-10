import type { Env } from '../env';
import { HttpError, notFound } from '../lib/http';
import { bookingRef } from '../email/booking';
import { cancelAndRefund, expireStaleHolds, loadBookingById, type RefundOutcome } from './bookings';
import { getAdminEvent, getRow } from './events';

/** Refunds per run. Each refund is a few subrequests and the free Workers plan allows 50 per request. */
export const REFUND_BATCH = 10;

export interface BookingFilter {
  eventId?: string;
  status?: string;
  needsAttention?: boolean;
}

interface JoinedRow {
  id: string;
  event_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  locale: string;
  number_of_participants: number;
  amount_minor: number;
  currency: string;
  payment_status: string;
  booking_status: string;
  needs_attention: number;
  attention_note: string | null;
  hold_expires_at: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  event_title: string;
  event_slug: string;
  event_status: string;
  event_starts_at: string;
  event_timezone: string;
}

export function adminBookingDto(r: JoinedRow) {
  return {
    id: r.id,
    reference: bookingRef(r.id),
    event_id: r.event_id,
    event_title: r.event_title,
    event_slug: r.event_slug,
    event_status: r.event_status,
    event_starts_at: r.event_starts_at,
    event_timezone: r.event_timezone,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone,
    locale: r.locale,
    participants: r.number_of_participants,
    amount_minor: r.amount_minor,
    currency: r.currency,
    payment_status: r.payment_status,
    booking_status: r.booking_status,
    needs_attention: r.needs_attention === 1,
    attention_note: r.attention_note,
    hold_expires_at: r.hold_expires_at,
    has_payment: r.stripe_payment_intent_id !== null,
    created_at: r.created_at,
  };
}

const SELECT = `SELECT b.*, e.title AS event_title, e.slug AS event_slug, e.status AS event_status,
       e.starts_at AS event_starts_at, e.timezone AS event_timezone
  FROM event_bookings b JOIN events e ON e.id = b.event_id`;

export async function listAdminBookings(env: Env, filter: BookingFilter = {}, limit = 500) {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter.eventId) {
    binds.push(filter.eventId);
    where.push(`b.event_id = ?${binds.length}`);
  }
  if (filter.status && ['pending', 'confirmed', 'cancelled', 'expired'].includes(filter.status)) {
    binds.push(filter.status);
    where.push(`b.booking_status = ?${binds.length}`);
  }
  if (filter.needsAttention) where.push('b.needs_attention = 1');
  const rows = await env.DB.prepare(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.created_at DESC, b.id LIMIT ${Math.min(limit, 2000)}`,
  )
    .bind(...binds)
    .all<JoinedRow>();
  return rows.results.map(adminBookingDto);
}

export async function getAdminBooking(env: Env, id: string) {
  const r = await env.DB.prepare(`${SELECT} WHERE b.id = ?1`).bind(id).first<JoinedRow>();
  if (!r) throw notFound('Booking not found');
  return adminBookingDto(r);
}

/**
 * CSV cell. Values that start with = + - @ (or a tab or carriage return) would be run as a formula by
 * Excel or Sheets, so they get a leading apostrophe. A customer controls their own name.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function bookingsCsv(rows: ReturnType<typeof adminBookingDto>[]): string {
  const header = ['Reference', 'Workshop', 'Starts (UTC)', 'Name', 'Email', 'Phone', 'Language', 'Places', 'Amount', 'Currency', 'Payment', 'Booking', 'Needs attention', 'Booked at (UTC)'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.reference,
        r.event_title,
        r.event_starts_at,
        r.customer_name,
        r.customer_email,
        r.customer_phone,
        r.locale,
        r.participants,
        (r.amount_minor / 100).toFixed(2),
        r.currency,
        r.payment_status,
        r.booking_status,
        r.needs_attention ? 'yes' : '',
        r.created_at,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Admin "Cancel booking": refunds a paid booking in full (or just cancels a free one). */
export async function adminCancelBooking(env: Env, id: string): Promise<{ outcome: RefundOutcome; message?: string }> {
  const b = await loadBookingById(env, id);
  if (!b) throw notFound('Booking not found');
  if (b.booking_status === 'pending') {
    throw new HttpError(409, 'still_pending', 'This booking is still waiting for payment. It will release its places by itself.');
  }
  const result = await cancelAndRefund(env, id, 'admin');
  if (result.outcome === 'failed') {
    throw new HttpError(502, 'refund_failed', `The refund did not go through (${result.message ?? 'unknown reason'}). The booking is marked for attention.`);
  }
  return result;
}

/** The owner has dealt with a flagged booking by hand (for example refunded it in Stripe). */
export async function markHandled(env: Env, id: string) {
  const r = await env.DB.prepare('UPDATE event_bookings SET needs_attention = 0, attention_note = NULL WHERE id = ?1 RETURNING id')
    .bind(id)
    .first();
  if (!r) throw notFound('Booking not found');
  return getAdminBooking(env, id);
}

// ---------------------------------------------------------------------------
// Cancelling a workshop that has bookings
// ---------------------------------------------------------------------------

export interface CancelSummary {
  confirmedBookings: number;
  confirmedPlaces: number;
  paidBookings: number;
  refundMinor: number;
  currency: string;
  pendingHolds: number;
}

async function cancelSummary(env: Env, eventId: string, currency: string): Promise<CancelSummary> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN 1 END), 0) AS cb,
            COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN number_of_participants END), 0) AS cp,
            COALESCE(SUM(CASE WHEN booking_status = 'confirmed' AND amount_minor > 0 THEN 1 END), 0) AS pb,
            COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN amount_minor END), 0) AS refund,
            COALESCE(SUM(CASE WHEN booking_status = 'pending' AND hold_expires_at > ?2 THEN 1 END), 0) AS holds
       FROM event_bookings WHERE event_id = ?1`,
  )
    .bind(eventId, new Date().toISOString())
    .first<{ cb: number; cp: number; pb: number; refund: number; holds: number }>();
  return {
    confirmedBookings: r?.cb ?? 0,
    confirmedPlaces: r?.cp ?? 0,
    paidBookings: r?.pb ?? 0,
    refundMinor: r?.refund ?? 0,
    currency,
    pendingHolds: r?.holds ?? 0,
  };
}

/**
 * Refund (and notify) the confirmed bookings of CANCELLED workshops, a few at a time. A booking whose
 * refund fails is flagged for the owner and skipped from then on, so one bad payment never blocks
 * the others or loops forever.
 */
export async function processCancelledEventBookings(env: Env, opts: { eventId?: string; limit?: number } = {}) {
  const limit = opts.limit ?? REFUND_BATCH;
  const filter = opts.eventId ? 'AND b.event_id = ?1' : '';
  const binds = opts.eventId ? [opts.eventId] : [];
  const due = await env.DB.prepare(
    `SELECT b.id FROM event_bookings b JOIN events e ON e.id = b.event_id
      WHERE e.status = 'cancelled' AND b.booking_status = 'confirmed' AND b.needs_attention = 0 ${filter}
      ORDER BY b.created_at LIMIT ${limit}`,
  )
    .bind(...binds)
    .all<{ id: string }>();
  let done = 0;
  let failed = 0;
  for (const row of due.results) {
    const r = await cancelAndRefund(env, row.id, 'event_cancelled');
    if (r.outcome === 'failed') failed++;
    else done++;
  }
  const left = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM event_bookings b JOIN events e ON e.id = b.event_id
      WHERE e.status = 'cancelled' AND b.booking_status = 'confirmed' AND b.needs_attention = 0 ${filter}`,
  )
    .bind(...binds)
    .first<{ n: number }>();
  return { done, failed, remaining: left?.n ?? 0 };
}

/**
 * Cancel a workshop. With no bookings it simply cancels. With bookings it first asks for a
 * confirmation (saying how many people and how much money), then cancels, releases unpaid holds,
 * and refunds and emails everyone who had booked.
 */
export async function cancelEvent(env: Env, id: string, confirm: boolean) {
  const row = await getRow(env, id);
  if (row.status === 'cancelled' || row.status === 'completed') {
    throw new HttpError(409, 'not_cancellable', `This event is already ${row.status}.`);
  }
  const summary = await cancelSummary(env, id, row.currency);
  const affected = summary.confirmedBookings + summary.pendingHolds;
  if (affected > 0 && !confirm) {
    throw new HttpError(
      409,
      'confirmation_required',
      `This workshop has ${summary.confirmedBookings} booking(s). Cancelling it will refund them in full and email each person.`,
      summary,
    );
  }
  await env.DB.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?1`).bind(id).run();
  // People still in the middle of paying lose their hold. If one pays anyway, the payment is refunded automatically.
  await env.DB.prepare(
    `UPDATE event_bookings SET booking_status = 'expired', payment_status = 'failed' WHERE event_id = ?1 AND booking_status = 'pending'`,
  )
    .bind(id)
    .run();
  const refunds = await processCancelledEventBookings(env, { eventId: id });
  return { event: await getAdminEvent(env, id), summary, refunds };
}

/** Cron entry: expire stale holds, then keep refunding cancelled workshops. */
export async function bookingMaintenance(env: Env): Promise<void> {
  await expireStaleHolds(env);
  await processCancelledEventBookings(env);
}
