'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, adminApi, type AdminBooking, type AdminEvent } from '@/lib/admin-api';
import { Notice, PageTitle } from './ui';

const money = (minor: number, currency: string) =>
  minor === 0
    ? 'Free'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "5 days", "11 hours" until the workshop starts, to judge the 24-hour rule. */
export function untilStart(startsAt: string, nowMs = Date.now()): { hours: number; text: string } {
  const hours = (Date.parse(startsAt) - nowMs) / 3_600_000;
  if (hours <= 0) return { hours, text: 'it has already started' };
  if (hours < 48) return { hours, text: `it starts in ${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? '' : 's'}` };
  return { hours, text: `it starts in ${Math.round(hours / 24)} days` };
}

const BOOKING_TEXT: Record<AdminBooking['booking_status'], string> = {
  pending: 'Waiting for payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired (not paid)',
};
const PAYMENT_TEXT: Record<AdminBooking['payment_status'], string> = {
  pending: 'Not paid yet',
  paid: 'Paid',
  failed: 'Not paid',
  refunded: 'Refunded',
};

/** Everyone who booked: who, how many places, what they paid, and a refund button. */
export function BookingsAdmin() {
  const params = useSearchParams();
  const [eventId, setEventId] = useState(params.get('event') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [attention, setAttention] = useState(params.get('attention') === '1');
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState('');

  const query = new URLSearchParams();
  if (eventId) query.set('event', eventId);
  if (status) query.set('status', status);
  if (attention) query.set('attention', '1');
  const qs = query.toString() ? `?${query.toString()}` : '';

  const load = useCallback(() => {
    let current = true;
    adminApi
      .get<{ bookings: AdminBooking[] }>(`/bookings${qs}`)
      .then((r) => {
        if (current) {
          setBookings(r.bookings);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof AdminApiError ? e.message : 'Could not load the bookings.');
      });
    return () => {
      current = false;
    };
  }, [qs]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    adminApi
      .get<{ events: AdminEvent[] }>('/events')
      .then((r) => setEvents(r.events))
      .catch(() => undefined);
  }, []);

  async function cancel(b: AdminBooking) {
    const left = untilStart(b.event_starts_at);
    const paid = b.payment_status === 'paid' && b.amount_minor > 0;
    const rule =
      left.hours >= 24
        ? 'This is more than 24 hours before the start, so a full refund follows your cancellation rule.'
        : 'This is less than 24 hours before the start, so your 24-hour rule does not apply. It is your decision.';
    const text = paid
      ? `Cancel ${b.customer_name}'s booking and refund ${money(b.amount_minor, b.currency)} to their card?\n\nFor "${b.event_title}", ${left.text}. ${rule}\n\nThey get an email.`
      : `Cancel ${b.customer_name}'s booking for "${b.event_title}"? They get an email and the places are free again.`;
    if (!window.confirm(text)) return;
    setBusyId(b.id);
    setNotice(null);
    try {
      await adminApi.post<AdminBooking>(`/bookings/${b.id}/cancel`);
      setNotice({ kind: 'success', text: paid ? 'Cancelled and refunded. The customer has been emailed.' : 'Cancelled. The customer has been emailed.' });
      load();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Something went wrong.' });
      load();
    } finally {
      setBusyId('');
    }
  }

  async function handled(b: AdminBooking) {
    if (!window.confirm('Mark this as handled? Do this once you have dealt with it yourself, for example refunded it in Stripe.')) return;
    setBusyId(b.id);
    try {
      await adminApi.post(`/bookings/${b.id}/handled`);
      load();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Something went wrong.' });
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-8">
      <PageTitle
        aside={
          <a className="btn" href={`/api/admin/bookings/export.csv${qs}`} download>
            Download as spreadsheet (CSV)
          </a>
        }
      >
        Bookings
      </PageTitle>
      <p className="max-w-2xl text-stone">
        Everyone who booked online. Customers who change their mind more than 24 hours before the start email you; press Cancel and refund and they are paid back in full and told by email.
      </p>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4" role="group" aria-label="Filter bookings">
        <div>
          <label htmlFor="f-event" className="mb-1 block text-sm">
            Workshop
          </label>
          <select id="f-event" className="field" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">All workshops</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.starts_local.slice(0, 10)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm">
            Status
          </label>
          <select id="f-status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {(Object.keys(BOOKING_TEXT) as Array<AdminBooking['booking_status']>).map((s) => (
              <option key={s} value={s}>
                {BOOKING_TEXT[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
          Needs attention only
        </label>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {bookings === null && !error ? <p className="text-stone">Loading...</p> : null}
      {bookings && bookings.length === 0 ? <Notice kind="info">No bookings match.</Notice> : null}

      {bookings && bookings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">Bookings</caption>
            <thead className="border-b border-ink text-sm">
              <tr>
                {['Booked', 'Workshop', 'Customer', 'Places', 'Amount', 'Status', ''].map((h, i) => (
                  <th key={i} scope="col" className="py-2 pr-4 font-medium">
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-hairline align-top" data-testid="booking-row">
                  <td className="py-3 pr-4 text-sm">
                    {when(b.created_at)}
                    <span className="block text-stone">{b.reference}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/admin/events/edit?id=${b.event_id}`} className="link">
                      {b.event_title}
                    </Link>
                    <span className="block text-sm text-stone">{when(b.event_starts_at)}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {b.customer_name}
                    <a className="link block text-sm" href={`mailto:${b.customer_email}`}>
                      {b.customer_email}
                    </a>
                    {b.customer_phone ? <span className="block text-sm text-stone">{b.customer_phone}</span> : null}
                  </td>
                  <td className="py-3 pr-4">{b.participants}</td>
                  <td className="py-3 pr-4">{money(b.amount_minor, b.currency)}</td>
                  <td className="py-3 pr-4">
                    <span className="block">{BOOKING_TEXT[b.booking_status]}</span>
                    <span className="block text-sm text-stone">{PAYMENT_TEXT[b.payment_status]}</span>
                    {b.needs_attention ? (
                      <span className="mt-1 block text-sm text-alert" data-testid="attention">
                        Needs attention{b.attention_note ? `: ${b.attention_note}` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col items-start gap-2">
                      {b.booking_status === 'confirmed' ? (
                        <button type="button" className="btn text-alert" disabled={busyId === b.id} onClick={() => cancel(b)}>
                          {b.amount_minor > 0 ? 'Cancel and refund' : 'Cancel booking'}
                        </button>
                      ) : null}
                      {b.needs_attention ? (
                        <button type="button" className="btn" disabled={busyId === b.id} onClick={() => handled(b)}>
                          Mark as handled
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
