'use client';

import { dayInZone, localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { intlLocale } from '@/i18n/dictionary';
import { addMonths, buildMonth, eventsByDay, monthKey, monthOf } from '@/lib/calendar';
import { formatEventTimes, placesState, placesText } from '@/lib/event-format';
import type { PublicEvent } from '@/lib/types';
import { useAvailability, useNow } from './event-hooks';
import type { EventStrings } from './EventsList';

/**
 * Month calendar of all workshops. Wide screens get the classic grid (Monday first); phones get
 * a plain list of the month's workshops, which is easier to read than a tiny grid.
 */
export function CalendarView({
  events,
  locale,
  t,
  builtAtMs,
}: {
  events: PublicEvent[];
  locale: Locale;
  t: EventStrings;
  builtAtMs: number;
}) {
  const now = useNow(builtAtMs);
  const availability = useAvailability();
  const loc = intlLocale[locale];

  // start on the current month (the build's month until the real clock is known)
  const startDay = dayInZone(new Date(now).toISOString(), 'Europe/Copenhagen');
  const [picked, setPicked] = useState<{ year: number; month0: number } | null>(null);
  const year = picked?.year ?? Number(startDay.slice(0, 4));
  const month0 = picked?.month0 ?? Number(startDay.slice(5, 7)) - 1;
  const todayKey = startDay;

  const byDay = useMemo(() => eventsByDay(events), [events]);
  const weeks = useMemo(() => buildMonth(year, month0), [year, month0]);
  const thisMonth = monthKey(year, month0);
  const monthEvents = useMemo(
    () => [...byDay.entries()].filter(([day]) => monthOf(day) === thisMonth).flatMap(([, list]) => list).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [byDay, thisMonth],
  );

  const title = new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month0, 1)));
  // 2024-01-01 was a Monday: the weekday names, Monday first
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(loc, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
  const go = (delta: number) => setPicked(addMonths(year, month0, delta));

  const chipText = (e: PublicEvent) => {
    const places = placesText(placesState(e, availability.get(e.slug), now), t);
    return places;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-serif text-3xl capitalize" aria-live="polite">
          {title}
        </h2>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => go(-1)} aria-label={t.prevMonth}>
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <button type="button" className="btn" onClick={() => go(1)} aria-label={t.nextMonth}>
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      </div>

      {/* wide screens: the month grid */}
      <div className="hidden md:block" role="grid" aria-label={title}>
        <div role="row" className="grid grid-cols-7 border-b border-ink pb-2 text-sm text-stone">
          {weekdays.map((d) => (
            <div key={d} role="columnheader" className="px-2 capitalize">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7 border-b border-hairline">
            {week.map((cell) => {
              const list = byDay.get(cell.date) ?? [];
              const isToday = cell.date === todayKey;
              return (
                <div
                  key={cell.date}
                  role="gridcell"
                  aria-label={cell.date}
                  className={`min-h-[7.5rem] border-l border-hairline px-2 py-2 first:border-l-0 ${cell.inMonth ? '' : 'bg-paper/60 text-stone/60'}`}
                >
                  <p className={`mb-1 text-sm ${isToday ? 'inline-block rounded-full bg-ink px-2 text-wall' : ''}`}>{Number(cell.date.slice(8))}</p>
                  <ul className="space-y-1">
                    {list.map((e) => {
                      const places = chipText(e);
                      return (
                        <li key={e.slug}>
                          <Link
                            href={localePath(locale, `/workshops/${e.slug}`)}
                            className={`block border-l-2 py-1 pl-2 text-[0.82rem] leading-snug hover:bg-paper ${
                              e.status === 'cancelled' ? 'border-hairline text-stone line-through' : e.status === 'completed' || Date.parse(e.endsAt) < now ? 'border-hairline text-stone' : 'border-lapis'
                            }`}
                          >
                            <span className="block text-stone">{formatEventTimes(e.startsAt, e.endsAt, e.timezone, locale).split('–')[0]}</span>
                            <span className="block font-medium">{e.title}</span>
                            {places ? <span className="block text-stone">{places}</span> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* phones: a plain list of this month's workshops */}
      <div className="md:hidden">
        {monthEvents.length === 0 ? (
          <p className="text-stone">{t.noneThisMonth}</p>
        ) : (
          <ul className="border-b border-hairline">
            {monthEvents.map((e) => {
              const places = chipText(e);
              return (
                <li key={e.slug} className="border-t border-hairline py-4">
                  <Link href={localePath(locale, `/workshops/${e.slug}`)} className="block">
                    <p className="text-sm text-stone">
                      {new Intl.DateTimeFormat(loc, { timeZone: e.timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(e.startsAt))},{' '}
                      {formatEventTimes(e.startsAt, e.endsAt, e.timezone, locale)}
                    </p>
                    <p className={`font-serif text-xl ${e.status === 'cancelled' ? 'line-through' : ''}`}>{e.title}</p>
                    {places ? <p className="text-sm text-stone">{places}</p> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
