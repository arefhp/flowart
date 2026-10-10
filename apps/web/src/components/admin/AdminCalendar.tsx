'use client';

import { dayInZone } from '@flowart/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminApiError, adminApi, type AdminEvent } from '@/lib/admin-api';
import { addMonths, buildMonth, eventsByDay } from '@/lib/calendar';
import { Notice, PageTitle } from './ui';
import { STATUS_TEXT, placesText } from './EventsAdmin';

const STATUS_BORDER: Record<AdminEvent['status'], string> = {
  draft: 'border-dashed border-stone text-stone',
  published: 'border-lapis',
  cancelled: 'border-alert text-stone line-through',
  completed: 'border-hairline text-stone',
};

/** Every workshop (drafts and cancelled ones too) by date, with how many places are booked. */
export function AdminCalendar() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState('');
  const today = dayInZone(new Date().toISOString(), 'Europe/Copenhagen');
  const [picked, setPicked] = useState<{ year: number; month0: number } | null>(null);
  const year = picked?.year ?? Number(today.slice(0, 4));
  const month0 = picked?.month0 ?? Number(today.slice(5, 7)) - 1;

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

  const byDay = useMemo(() => eventsByDay((events ?? []).map((e) => ({ ...e, startsAt: e.starts_at }))), [events]);
  const weeks = useMemo(() => buildMonth(year, month0), [year, month0]);
  const title = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month0, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  const go = (delta: number) => setPicked(addMonths(year, month0, delta));

  return (
    <div>
      <PageTitle>Calendar</PageTitle>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {events === null && !error ? <p className="text-stone">Loading...</p> : null}
      {events ? (
        <>
          <p className="mb-6 max-w-2xl text-sm text-stone">
            Each workshop shows the places booked out of the total. Solid blue edge = published, dashed = draft, struck through = cancelled. Click one to edit it.
          </p>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-serif text-3xl" aria-live="polite">
              {title}
            </h2>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => go(-1)} aria-label="Previous month">
                <span aria-hidden="true">&lsaquo;</span>
              </button>
              <button type="button" className="btn" onClick={() => go(1)} aria-label="Next month">
                <span aria-hidden="true">&rsaquo;</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[48rem]" role="grid" aria-label={title}>
              <div role="row" className="grid grid-cols-7 border-b border-ink pb-2 text-sm text-stone">
                {weekdays.map((d) => (
                  <div key={d} role="columnheader" className="px-2">
                    {d}
                  </div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} role="row" className="grid grid-cols-7 border-b border-hairline">
                  {week.map((cell) => {
                    const list = byDay.get(cell.date) ?? [];
                    return (
                      <div key={cell.date} role="gridcell" aria-label={cell.date} className={`min-h-[7rem] border-l border-hairline px-2 py-2 first:border-l-0 ${cell.inMonth ? '' : 'bg-paper/60 text-stone/60'}`}>
                        <p className={`mb-1 text-sm ${cell.date === today ? 'inline-block rounded-full bg-ink px-2 text-wall' : ''}`}>{Number(cell.date.slice(8))}</p>
                        <ul className="space-y-1">
                          {list.map((e) => (
                            <li key={e.id}>
                              <Link href={`/admin/events/edit?id=${e.id}`} className={`block border-l-2 py-1 pl-2 text-[0.82rem] leading-snug hover:bg-paper ${STATUS_BORDER[e.status]}`}>
                                <span className="block text-stone">{e.starts_local.slice(11)}</span>
                                <span className="block font-medium">{e.title}</span>
                                <span className="block text-stone">
                                  {placesText(e)} <span className="sr-only">({STATUS_TEXT[e.status]})</span>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
