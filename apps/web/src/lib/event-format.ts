import { formatEventDate, formatEventTimes, type Locale } from '@flowart/shared';
import { fmt, formatPrice, intlLocale, type Dict } from '@/i18n/dictionary';
import type { EventAvailability, PublicEvent } from './types';

// formatEventDate and formatEventTimes live in @flowart/shared so the emails use the same code.
export { formatEventDate, formatEventTimes };

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
