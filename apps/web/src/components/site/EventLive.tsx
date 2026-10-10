'use client';

import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { placesState, placesText } from '@/lib/event-format';
import type { EventAvailability, PublicEvent } from '@/lib/types';
import { useNow } from './event-hooks';
import type { EventStrings } from './EventsList';

/**
 * The live part of a workshop page: places left, and what the visitor can do. The static page
 * never claims availability; this fetches it from the API every time the page opens.
 * (Online booking arrives in Milestone 3. Until then a place is requested by message.)
 */
export function EventLive({
  event,
  locale,
  t,
  builtAtMs,
}: {
  event: Pick<PublicEvent, 'slug' | 'status' | 'endsAt'>;
  locale: Locale;
  t: EventStrings;
  builtAtMs: number;
}) {
  const now = useNow(builtAtMs);
  const [availability, setAvailability] = useState<EventAvailability | undefined>();

  useEffect(() => {
    let current = true;
    fetch(`/api/events/${encodeURIComponent(event.slug)}/availability`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: (EventAvailability & { bookable: boolean }) | null) => {
        if (current && a) setAvailability(a);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [event.slug]);

  const state = placesState(event, availability, now);
  const text = placesText(state, t);
  const open = state.kind === 'left';

  return (
    <div className="space-y-5">
      <p aria-live="polite" className="min-h-[1.75rem] text-lg font-medium">
        {text}
      </p>
      {state.kind === 'cancelled' ? <p className="text-stone">{t.cancelledNotice}</p> : null}
      {open ? (
        <div className="space-y-3">
          <p className="max-w-md text-stone">{t.bookingSoon}</p>
          <Link href={`${localePath(locale, '/contact')}?event=${encodeURIComponent(event.slug)}`} className="btn btn-primary">
            {t.reserve}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
