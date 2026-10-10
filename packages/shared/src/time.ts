/**
 * Time zones without a library (spec section 5). Events are stored as UTC instants plus an IANA
 * time zone. The admin types LOCAL time (in the event's zone); the API converts it to UTC here.
 * Everything is derived from `Intl`, so daylight saving (the last Sundays of March and October in
 * Copenhagen) is handled by the platform's time zone data, not by hand-written rules.
 */
export const DEFAULT_TIMEZONE = 'Europe/Copenhagen';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at an instant, in milliseconds (Copenhagen: +1 h in winter, +2 h in summer). */
export function tzOffsetMs(instantMs: number, tz: string): number {
  const parts = formatter(tz).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asIfUtc - Math.floor(instantMs / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Parse "YYYY-MM-DDTHH:mm" (a wall-clock time with no zone). Returns null if it is not a real date and time. */
export function parseLocal(local: string): LocalParts | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute };
}

export type LocalToUtc =
  | { ok: true; utc: string; ambiguous: boolean }
  | { ok: false; reason: 'invalid' | 'nonexistent' };

/**
 * Wall-clock time in `tz` to a UTC instant (ISO string).
 * - A time that does not exist (the hour skipped when clocks go forward) is rejected as `nonexistent`.
 * - A time that happens twice (the hour repeated when clocks go back) is `ambiguous`; the FIRST
 *   occurrence (summer time) is used, so the result is always the same.
 */
export function localToUtc(local: string, tz: string): LocalToUtc {
  const p = parseLocal(local);
  if (!p || !isValidTimeZone(tz)) return { ok: false, reason: 'invalid' };
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const DAY = 86_400_000;
  const offsets = [...new Set([tzOffsetMs(guess - DAY, tz), tzOffsetMs(guess + DAY, tz)])];
  // an offset is right when the instant it produces really has that offset in this zone
  const instants = offsets.map((o) => guess - o).filter((ms) => guess - ms === tzOffsetMs(ms, tz));
  if (instants.length === 0) return { ok: false, reason: 'nonexistent' };
  const first = Math.min(...instants);
  return { ok: true, utc: new Date(first).toISOString(), ambiguous: instants.length > 1 };
}

/** UTC instant to "YYYY-MM-DDTHH:mm" wall-clock time in `tz` (what the admin form shows). */
export function utcToLocal(utcIso: string, tz: string): string {
  const ms = Date.parse(utcIso);
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/** The "YYYY-MM-DD" calendar day of an instant in `tz` (used to place an event on a calendar day). */
export function dayInZone(utcIso: string, tz: string): string {
  return utcToLocal(utcIso, tz).slice(0, 10);
}

export function isSameInstantOrder(startIso: string, endIso: string): boolean {
  return Date.parse(endIso) > Date.parse(startIso);
}
