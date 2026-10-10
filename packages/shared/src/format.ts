import type { Locale } from './constants';
import { dayInZone } from './time';

/**
 * Dates, times and money as people read them, used by the website AND the emails the Worker sends,
 * so a workshop is described identically everywhere. Dates and times are always shown in the
 * EVENT's own time zone, never the viewer's or the server's.
 */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', da: 'da-DK' };

/** "Saturday, 14 November 2026" / "lørdag den 14. november 2026" */
export function formatEventDate(startIso: string, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(startIso));
}

/** "10:00-13:00" on one day, or "14 Nov 10:00 - 15 Nov 13:00" when it spans days (en dash between). */
export function formatEventTimes(startIso: string, endIso: string, tz: string, locale: Locale): string {
  const loc = INTL_LOCALE[locale];
  const t = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (dayInZone(startIso, tz) === dayInZone(endIso, tz)) return `${t.format(start)}–${t.format(end)}`;
  const d = new Intl.DateTimeFormat(loc, { timeZone: tz, day: 'numeric', month: 'short' });
  return `${d.format(start)} ${t.format(start)} – ${d.format(end)} ${t.format(end)}`;
}

/** Money from minor units, without cents when the amount is whole: "DKK 550" / "550 kr." */
export function formatMoney(locale: Locale, minor: number, currency: string): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
