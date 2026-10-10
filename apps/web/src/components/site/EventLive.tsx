'use client';

import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Dict } from '@/i18n/dictionary';
import { placesState, placesText } from '@/lib/event-format';
import type { EventAvailability, PublicEvent } from '@/lib/types';
import { BookingForm, type BookingLabels } from './BookingForm';
import { useNow } from './event-hooks';
import type { EventStrings } from './EventsList';

/**
 * The live part of a workshop page: places left, and the booking form. The static page never claims
 * availability; this fetches it from the API every time the page opens.
 */
export function EventLive({
  event,
  locale,
  t,
  booking,
  labels,
  builtAtMs,
}: {
  event: Pick<PublicEvent, 'slug' | 'status' | 'endsAt' | 'priceMinor' | 'currency'>;
  locale: Locale;
  t: EventStrings;
  booking: Dict['booking'];
  labels: BookingLabels;
  builtAtMs: number;
}) {
  const now = useNow(builtAtMs);
  const [availability, setAvailability] = useState<EventAvailability | undefined>();
  const [reloads, setReloads] = useState(0);
  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let current = true;
    fetch(`/api/events/${encodeURIComponent(event.slug)}/availability`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: EventAvailability | null) => {
        if (current && a) setAvailability(a);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [event.slug, reloads]);

  const state = placesState(event, availability, now);
  const text = placesText(state, t);
  const open = state.kind === 'left';
  const askLink = (
    <p>
      <Link href={`${localePath(locale, '/contact')}?event=${encodeURIComponent(event.slug)}`} className="link">
        {booking.askQuestion}
      </Link>
    </p>
  );

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="min-h-[1.75rem] text-lg font-medium">
        {text}
      </p>
      {state.kind === 'cancelled' ? <p className="text-stone">{t.cancelledNotice}</p> : null}
      {open && availability ? (
        <>
          <BookingForm
            event={event}
            locale={locale}
            t={booking}
            labels={labels}
            maxPlaces={availability.maxPerBooking ?? Math.min(10, availability.remaining)}
            holdMinutes={availability.holdMinutes ?? 30}
            onStale={refresh}
          />
          {askLink}
        </>
      ) : null}
      {state.kind === 'soldOut' ? askLink : null}
    </div>
  );
}
