import { dayInZone, type Locale } from '@flowart/shared';
import { fmt, formatPrice, intlLocale, type Dict } from '@/i18n/dictionary';
import type { EventAvailability, PublicEvent } from './types';

/**
 * Dates and times of a workshop are always shown in the EVENT's own time zone (Copenhagen), no
 * matter where the visitor is or when the page was built (spec section 5).
 */
const longDate = (loc: string, tz: string) =>
  new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = (loc: string, tz: string) =>
  new Intl.DateTimeFormat(loc, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Saturday 14 November 2026" / "lørdag den 14. november 2026" */
export function formatEventDate(startIso: string, tz: string, locale: Locale): string {
  return longDate(intlLocale[locale], tz).format(new Date(startIso));
}

/** "10:00 to 13:00" (the same day) or "14 Nov 10:00 to 15 Nov 13:00" (it spans days). */
export function formatEventTimes(startIso: string, endIso: string, tz: string, locale: Locale): string {
  const loc = intlLocale[locale];
  const t = time(loc, tz);
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (dayInZone(startIso, tz) === dayInZone(endIso, tz)) return `${t.format(start)}–${t.format(end)}`;
  const d = new Intl.DateTimeFormat(loc, { timeZone: tz, day: 'numeric', month: 'short' });
  return `${d.format(start)} ${t.format(start)} – ${d.format(end)} ${t.format(end)}`;
}

/** The three little parts of a date badge: weekday, day number, month. */
export function dayBadge(startIso: string, tz: string, locale: Locale): { weekday: string; day: string; month: string } {
  const loc = intlLocale[locale];
  const d = new Date(startIso);
  return {
    weekday: new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: 'short' }).format(d),
    day: new Intl.DateTimeFormat(loc, { timeZone: tz, day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat(loc, { timeZone: tz, month: 'short' }).format(d),
  };
}

export function formatEventPrice(e: Pick<PublicEvent, 'priceMinor' | 'currency'>, locale: Locale, t: Pick<Dict['events'], 'free' | 'perPerson'>): string {
  if (e.priceMinor === 0) return t.free;
  return fmt(t.perPerson, { amount: formatPrice(locale, e.priceMinor, e.currency) });
}

export function isFinished(e: Pick<PublicEvent, 'status' | 'endsAt'>, nowMs: number): boolean {
  return e.status === 'completed' || Date.parse(e.endsAt) < nowMs;
}

/**
 * Upcoming (soonest first) and past (latest first). Done in the browser with the real clock, so a
 * workshop that has finished since the page was built moves to "past" without a rebuild.
 */
export function splitEvents<T extends Pick<PublicEvent, 'status' | 'endsAt' | 'startsAt'>>(
  events: T[],
  nowMs: number,
): { upcoming: T[]; past: T[] } {
  const upcoming = events.filter((e) => !isFinished(e, nowMs)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events.filter((e) => isFinished(e, nowMs)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

export type PlacesState =
  | { kind: 'cancelled' }
  | { kind: 'finished' }
  | { kind: 'soldOut' }
  | { kind: 'left'; n: number }
  | { kind: 'unknown' };

/** What to say about places. `unknown` until the live numbers arrive (we never trust the static page). */
export function placesState(e: Pick<PublicEvent, 'status' | 'endsAt'>, availability: EventAvailability | undefined, nowMs: number): PlacesState {
  if (e.status === 'cancelled') return { kind: 'cancelled' };
  if (isFinished(e, nowMs)) return { kind: 'finished' };
  if (!availability) return { kind: 'unknown' };
  if (availability.soldOut) return { kind: 'soldOut' };
  return { kind: 'left', n: availability.remaining };
}

export function placesText(state: PlacesState, t: Pick<Dict['events'], 'cancelled' | 'finished' | 'soldOut' | 'placesLeft' | 'oneLeft'>): string {
  switch (state.kind) {
    case 'cancelled':
      return t.cancelled;
    case 'finished':
      return t.finished;
    case 'soldOut':
      return t.soldOut;
    case 'left':
      return state.n === 1 ? t.oneLeft : fmt(t.placesLeft, { n: state.n });
    default:
      return '';
  }
}
