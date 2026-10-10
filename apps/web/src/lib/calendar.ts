import { dayInZone } from '@flowart/shared';
import type { PublicEvent } from './types';

/** A day cell of the month grid. `date` is "YYYY-MM-DD". */
export interface DayCell {
  date: string;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/**
 * Weeks of a month, Monday first (the Danish week). Every row has 7 cells, padded with the
 * neighbouring months' days. `month0` is 0 for January.
 */
export function buildMonth(year: number, month0: number): DayCell[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: DayCell[] = [];
  for (let i = offset; i > 0; i--) {
    const d = new Date(Date.UTC(year, month0, 1 - i));
    cells.push({ date: ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: ymd(year, month0, day), inMonth: true });
  while (cells.length % 7 !== 0) {
    const d = new Date(Date.UTC(year, month0, daysInMonth + (cells.length - offset - daysInMonth) + 1));
    cells.push({ date: ymd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: false });
  }
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const d = new Date(Date.UTC(year, month0 + delta, 1));
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
}

/** Events grouped by the calendar day they START on, in each event's own time zone. */
export function eventsByDay<T extends Pick<PublicEvent, 'startsAt' | 'timezone'>>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of events) {
    const day = dayInZone(e.startsAt, e.timezone);
    const list = map.get(day) ?? [];
    list.push(e);
    map.set(day, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return map;
}

/** "2026-11" for a month, used to pick a month's events. */
export const monthKey = (year: number, month0: number) => `${year}-${pad(month0 + 1)}`;

export function monthOf(dayIso: string): string {
  return dayIso.slice(0, 7);
}
