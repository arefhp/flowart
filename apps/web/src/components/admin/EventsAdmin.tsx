'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi, type AdminEvent, type CancelSummary, type RefundProgress } from '@/lib/admin-api';
import { announceContentSaved } from './AdminShell';
import { EventForm } from './EventForm';
import { Notice, PageTitle } from './ui';

/** "Sat 14 Nov 2026, 10:00-13:00" from the wall-clock strings the API gives (already in the event's zone). */
export function localRange(startLocal: string, endLocal: string): string {
  const s = new Date(`${startLocal}:00Z`);
  const e = new Date(`${endLocal}:00Z`);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return startLocal.slice(0, 10) === endLocal.slice(0, 10)
    ? `${day.format(s)}, ${time.format(s)}–${time.format(e)}`
    : `${day.format(s)} ${time.format(s)} – ${day.format(e)} ${time.format(e)}`;
}

export const STATUS_TEXT = { draft: 'Draft', published: 'Published', cancelled: 'Cancelled', completed: 'Completed' } as const;

const STATUS_STYLE: Record<AdminEvent['status'], string> = {
  draft: 'border-hairline text-stone',
  published: 'border-lapis text-lapis',
  cancelled: 'border-alert text-alert',
  completed: 'border-hairline text-stone',
};

export function StatusBadge({ status }: { status: AdminEvent['status'] }) {
  return <span className={`inline-block border px-2 py-0.5 text-sm ${STATUS_STYLE[status]}`}>{STATUS_TEXT[status]}</span>;
}

export function placesText(e: Pick<AdminEvent, 'booked_confirmed' | 'booked_held' | 'max_participants'>): string {
  const held = e.booked_held > 0 ? ` (+${e.booked_held} held while paying)` : '';
  return `${e.booked_confirmed} of ${e.max_participants}${held}`;
}

export function EventsAdmin() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    adminApi
      .get<{ events: AdminEvent[] }>('/events')
      .then((r) => {
        if (current) setEvents(r.events);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof AdminApiError ? e.message : 'Could not load the events.');
      });
    return () => {
      current = false;
    };
  }, []);

  const now = new Date().toISOString();
  const upcoming = events?.filter((e) => e.ends_at >= now && e.status !== 'completed').sort((a, b) => a.starts_at.localeCompare(b.starts_at)) ?? [];
  const past = events?.filter((e) => !(e.ends_at >= now && e.status !== 'completed')) ?? [];

  const table = (rows: AdminEvent[], caption: string) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-ink text-sm">
          <tr>
            {['Event', 'When (Copenhagen time)', 'Places booked', 'Price', 'Status'].map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-hairline">
              <td className="py-3 pr-4">
                <Link href={`/admin/events/edit?id=${e.id}`} className="link font-serif text-lg">
                  {e.title}
                </Link>
              </td>
              <td className="py-3 pr-4">{localRange(e.starts_local, e.ends_local)}</td>
              <td className="py-3 pr-4">{placesText(e)}</td>
              <td className="py-3 pr-4">
                {e.price_minor === 0
                  ? 'Free'
                  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: e.currency, maximumFractionDigits: e.price_minor % 100 === 0 ? 0 : 2 }).format(e.price_minor / 100)}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={e.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-12">
      <PageTitle
        aside={
          <Link href="/admin/events/new" className="btn btn-primary">
            New event
          </Link>
        }
      >
        Events
      </PageTitle>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {events === null && !error ? <p className="text-stone">Loading...</p> : null}
      {events && events.length === 0 ? <Notice kind="info">No events yet. Create your first workshop with "New event".</Notice> : null}
      {events && upcoming.length > 0 ? (
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="mb-3 text-xl">
            Upcoming
          </h2>
          {table(upcoming, 'Upcoming events')}
        </section>
      ) : null}
      {events && past.length > 0 ? (
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="mb-3 text-xl">
            Past and cancelled
          </h2>
          {table(past, 'Past and cancelled events')}
        </section>
      ) : null}
    </div>
  );
}

export function NewEvent() {
  const router = useRouter();
  return (
    <div>
      <PageTitle>New event</PageTitle>
      <p className="mb-8 max-w-2xl text-stone">It is saved as a draft that visitors cannot see. When it is ready, you publish it on the next screen.</p>
      <EventForm event={null} onSaved={(saved) => router.push(`/admin/events/edit?id=${saved.id}&created=1`)} />
    </div>
  );
}

export function EditEvent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const created = params.get('created') === '1';
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No event selected.');
      return;
    }
    let current = true;
    adminApi
      .get<AdminEvent>(`/events/${id}`)
      .then((e) => {
        if (current) setEvent(e);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof AdminApiError && e.status === 404 ? 'This event no longer exists.' : 'Could not load the event.');
      });
    return () => {
      current = false;
    };
  }, [id]);

  async function act(path: string, success: string, confirmText?: string) {
    if (!event) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await adminApi.post<AdminEvent>(`/events/${event.id}/${path}`, {});
      setEvent(updated);
      setNotice({ kind: 'success', text: success });
      announceContentSaved();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

  /**
   * Cancel the workshop. With no bookings it just cancels. With bookings the server first answers
   * "confirmation required" with the numbers; the owner confirms and the call is repeated, which refunds
   * every paid booking and emails everyone.
   */
  async function cancelEvent() {
    if (!event) return;
    // With nobody booked a plain question is enough; with bookings the server's numbers are shown instead.
    if (event.booked_confirmed + event.booked_held === 0 && !window.confirm(`Cancel "${event.title}"? Visitors will see it as cancelled and nobody can book it.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      let confirm = false;
      for (;;) {
        try {
          const res = await adminApi.post<AdminEvent & { refunds?: RefundProgress }>(`/events/${event.id}/cancel`, confirm ? { confirm: true } : {});
          setEvent(res);
          announceContentSaved();
          const r = res.refunds;
          const failed = r && r.failed > 0;
          const more = r && r.remaining > 0;
          setNotice({
            kind: failed ? 'error' : 'success',
            text:
              'The event is cancelled. The site shows it as cancelled.' +
              (r ? ` ${r.done} booking${r.done === 1 ? '' : 's'} cancelled and refunded, and the customers emailed.` : '') +
              (more ? ` ${r!.remaining} more are being refunded automatically over the next few minutes.` : '') +
              (failed ? ` ${r!.failed} refund${r!.failed === 1 ? '' : 's'} did not go through: open Bookings and filter by "Needs attention".` : ''),
          });
          return;
        } catch (e) {
          if (!confirm && e instanceof AdminApiError && e.code === 'confirmation_required' && e.details) {
            const d = e.details as unknown as CancelSummary;
            const lines = [
              `Cancel "${event.title}"?`,
              '',
              d.confirmedBookings > 0
                ? `${d.confirmedBookings} booking${d.confirmedBookings === 1 ? '' : 's'} (${d.confirmedPlaces} place${d.confirmedPlaces === 1 ? '' : 's'}) will be cancelled and every customer is emailed.`
                : 'Nobody has a confirmed booking yet.',
              d.refundMinor > 0 ? `${money(d.refundMinor, d.currency)} will be refunded to the customers' cards.` : '',
              d.pendingHolds > 0 ? `${d.pendingHolds} person${d.pendingHolds === 1 ? ' is' : 's are'} in the middle of paying; their places are released, and a payment that still arrives is refunded.` : '',
              '',
              'This cannot be undone.',
            ].filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''));
            if (!window.confirm(lines.join('\n'))) return;
            confirm = true;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await adminApi.delete(`/events/${event.id}`);
      announceContentSaved();
      router.push('/admin/events');
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Could not delete the event.' });
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <Notice kind="error">{error}</Notice>
        <p className="mt-4">
          <Link href="/admin/events" className="link">
            Back to events
          </Link>
        </p>
      </div>
    );
  }
  if (!event) return <p className="text-stone">Loading...</p>;

  const live = event.status === 'draft' || event.status === 'published';
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <p className="text-sm">
          <Link href="/admin/events" className="link text-stone">
            Events
          </Link>
        </p>
        <PageTitle aside={<StatusBadge status={event.status} />}>{event.title}</PageTitle>
        <p className="text-stone">
          {localRange(event.starts_local, event.ends_local)} (Copenhagen time). Places booked: {placesText(event)}.
        </p>
        {event.bookings_total > 0 ? (
          <p>
            <Link href={`/admin/bookings?event=${event.id}`} className="link">
              See the bookings for this event
            </Link>
          </p>
        ) : null}
        {created ? <Notice kind="success">Saved as a draft. Visitors cannot see it yet. Press Publish when it is ready.</Notice> : null}
        {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}

        {live ? (
          <div className="flex flex-wrap gap-3" role="group" aria-label="Event actions">
            {event.status === 'draft' ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('publish', 'Published. It appears on the site in a few minutes.')}>
                Publish
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => act('unpublish', 'Back to draft. Visitors can no longer see it.', 'Take this event off the public site and back to draft?')}
              >
                Back to draft
              </button>
            )}
            <button
              type="button"
              className="btn text-alert"
              disabled={busy}
              onClick={cancelEvent}
            >
              Cancel event
            </button>
          </div>
        ) : null}
      </div>

      <EventForm event={event} onSaved={(saved) => setEvent(saved)} />

      <section aria-labelledby="ev-danger" className="border-t border-hairline pt-8">
        <h2 id="ev-danger" className="mb-2 text-xl">
          Delete this event
        </h2>
        <p className="mb-4 max-w-xl text-stone">
          Only possible when nobody has ever booked. To stop an event that has bookings, cancel it instead. A draft that you no longer need can simply be deleted.
        </p>
        <button type="button" className="btn text-alert" disabled={busy} onClick={remove}>
          Delete event
        </button>
      </section>
    </div>
  );
}
