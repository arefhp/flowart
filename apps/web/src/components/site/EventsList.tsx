'use client';

import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { useMemo } from 'react';
import type { Dict } from '@/i18n/dictionary';
import { dayBadge, formatEventPrice, formatEventTimes, placesState, placesText, splitEvents } from '@/lib/event-format';
import type { EventAvailability, PublicEvent } from '@/lib/types';
import { useAvailability, useNow } from './event-hooks';

export type EventStrings = Dict['events'];

function EventRow({
  event,
  locale,
  t,
  availability,
  now,
  muted,
}: {
  event: PublicEvent;
  locale: Locale;
  t: EventStrings;
  availability: EventAvailability | undefined;
  now: number;
  muted?: boolean;
}) {
  const badge = dayBadge(event.startsAt, event.timezone, locale);
  const places = placesText(placesState(event, availability, now), t);
  const cancelled = event.status === 'cancelled';
  return (
    <li>
      <Link
        href={localePath(locale, `/workshops/${event.slug}`)}
        className={`group grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-6 border-t border-hairline py-6 ${muted ? 'opacity-70' : ''}`}
      >
        <div className="text-center leading-none">
          <p className="text-[0.8rem] text-stone">{badge.weekday}</p>
          <p className="my-1 font-serif text-[2.4rem]">{badge.day}</p>
          <p className="text-[0.8rem] text-stone">{badge.month}</p>
        </div>
        <div>
          <h3 className={`font-serif text-[1.55rem] leading-tight group-hover:underline underline-offset-4 decoration-1 ${cancelled ? 'line-through decoration-stone' : ''}`}>
            {event.title}
          </h3>
          <div className="wall-label mt-2">
            <p>
              {formatEventTimes(event.startsAt, event.endsAt, event.timezone, locale)}
              <span className="sr-only">, {t.timeZoneNote}</span>
            </p>
            {event.location ? <p>{event.location}</p> : null}
            <p>{formatEventPrice(event, locale, t)}</p>
            <p aria-live="polite" className={`min-h-[1.5em] ${places && (cancelled || places === t.soldOut) ? 'font-medium text-ink' : ''}`}>
              {places}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * Workshops as a list: upcoming first (soonest at the top), past ones below. Places are live;
 * the split between upcoming and past follows the real clock.
 */
export function EventsList({
  events,
  locale,
  t,
  builtAtMs,
  variant = 'page',
  limit,
}: {
  events: PublicEvent[];
  locale: Locale;
  t: EventStrings;
  builtAtMs: number;
  /** `home` shows a short "upcoming" teaser and nothing at all when there are none */
  variant?: 'page' | 'home';
  limit?: number;
}) {
  const now = useNow(builtAtMs);
  const availability = useAvailability();
  const { upcoming, past } = useMemo(() => splitEvents(events, now), [events, now]);
  // the home-page teaser leaves out cancelled workshops; the full list shows them (struck through)
  const candidates = variant === 'home' ? upcoming.filter((e) => e.status !== 'cancelled') : upcoming;
  const shownUpcoming = limit ? candidates.slice(0, limit) : candidates;

  if (variant === 'home') {
    if (shownUpcoming.length === 0) return null;
    return (
      <section aria-labelledby="home-workshops" className="mt-28">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="home-workshops" className="text-3xl">
            {t.homeUpcoming}
          </h2>
          <Link href={localePath(locale, '/workshops')} className="link">
            {t.seeAll}
          </Link>
        </div>
        <ul className="max-w-3xl border-b border-hairline">
          {shownUpcoming.map((e) => (
            <EventRow key={e.slug} event={e} locale={locale} t={t} availability={availability.get(e.slug)} now={now} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="max-w-3xl">
      {upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="mb-4 text-3xl">
            {t.upcoming}
          </h2>
          <ul className="border-b border-hairline">
            {upcoming.map((e) => (
              <EventRow key={e.slug} event={e} locale={locale} t={t} availability={availability.get(e.slug)} now={now} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-stone">{t.none}</p>
      )}

      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="mt-20">
          <h2 id="past-heading" className="mb-4 text-3xl text-stone">
            {t.past}
          </h2>
          <ul className="border-b border-hairline">
            {past.slice(0, 12).map((e) => (
              <EventRow key={e.slug} event={e} locale={locale} t={t} availability={undefined} now={now} muted />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
