import { describe, expect, it } from 'vitest';
import { addMonths, buildMonth, eventsByDay, monthKey } from './calendar';
import { dayBadge, formatEventDate, formatEventPrice, formatEventTimes, placesState, placesText, splitEvents } from './event-format';
import type { PublicEvent } from './types';
import { en } from '@/i18n/dictionary';

const ev = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  slug: 'x',
  title: 'X',
  startsAt: '2026-07-14T08:00:00.000Z',
  endsAt: '2026-07-14T11:00:00.000Z',
  timezone: 'Europe/Copenhagen',
  priceMinor: 45000,
  currency: 'DKK',
  status: 'published',
  ...over,
});

describe('event dates and times are shown in the event\'s own time zone', () => {
  it('summer: 08:00 UTC is 10:00 in Copenhagen, whatever the server or visitor zone', () => {
    expect(formatEventTimes('2026-07-14T08:00:00.000Z', '2026-07-14T11:00:00.000Z', 'Europe/Copenhagen', 'en')).toBe('10:00–13:00');
  });
  it('winter: 09:00 UTC is 10:00 in Copenhagen', () => {
    expect(formatEventTimes('2026-01-14T09:00:00.000Z', '2026-01-14T12:00:00.000Z', 'Europe/Copenhagen', 'en')).toBe('10:00–13:00');
  });
  it('across the spring clock change the wall-clock times are still right', () => {
    // 28 March 22:00 (winter) to 29 March 04:00 (summer): 21:00Z to 02:00Z
    expect(formatEventTimes('2026-03-28T21:00:00.000Z', '2026-03-29T02:00:00.000Z', 'Europe/Copenhagen', 'en')).toMatch(/^28 Mar 22:00 – 29 Mar 04:00$/);
  });
  it('the date is the Copenhagen day: 23:30 in Copenhagen is still that evening', () => {
    expect(formatEventDate('2026-07-14T21:30:00.000Z', 'Europe/Copenhagen', 'en')).toMatch(/^Tuesday,? 14 July 2026$/);
    expect(formatEventDate('2026-07-14T22:30:00.000Z', 'Europe/Copenhagen', 'en')).toMatch(/^Wednesday,? 15 July 2026$/); // 00:30 next day there
  });
  it('speaks Danish', () => {
    expect(formatEventDate('2026-07-14T08:00:00.000Z', 'Europe/Copenhagen', 'da')).toMatch(/tirsdag.*14.*juli.*2026/);
    expect(dayBadge('2026-07-14T08:00:00.000Z', 'Europe/Copenhagen', 'da').day).toContain('14');
  });
});

describe('price per person', () => {
  it('shows the amount per person, or "Free"', () => {
    expect(formatEventPrice({ priceMinor: 45000, currency: 'DKK' }, 'en', en.events)).toMatch(/450.* per person/);
    expect(formatEventPrice({ priceMinor: 0, currency: 'DKK' }, 'en', en.events)).toBe('Free');
  });
});

describe('upcoming and past', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');
  const list = [
    ev({ slug: 'future-b', startsAt: '2026-09-01T08:00:00.000Z', endsAt: '2026-09-01T11:00:00.000Z' }),
    ev({ slug: 'future-a', startsAt: '2026-08-01T08:00:00.000Z', endsAt: '2026-08-01T11:00:00.000Z' }),
    ev({ slug: 'old-recent', startsAt: '2026-07-01T08:00:00.000Z', endsAt: '2026-07-01T11:00:00.000Z' }),
    ev({ slug: 'old-older', startsAt: '2026-06-01T08:00:00.000Z', endsAt: '2026-06-01T11:00:00.000Z', status: 'completed' }),
    ev({ slug: 'future-cancelled', startsAt: '2026-08-15T08:00:00.000Z', endsAt: '2026-08-15T11:00:00.000Z', status: 'cancelled' }),
  ];
  it('splits by the real clock: soonest first for upcoming, latest first for past', () => {
    const { upcoming, past } = splitEvents(list, now);
    expect(upcoming.map((e) => e.slug)).toEqual(['future-a', 'future-cancelled', 'future-b']);
    expect(past.map((e) => e.slug)).toEqual(['old-recent', 'old-older']);
  });
  it('an event that ends later today is still upcoming; one that has just ended is past', () => {
    expect(splitEvents([ev({ endsAt: '2026-07-20T13:00:00.000Z' })], now).upcoming).toHaveLength(1);
    expect(splitEvents([ev({ endsAt: '2026-07-20T11:59:00.000Z' })], now).past).toHaveLength(1);
  });
});

describe('places wording', () => {
  const now = Date.parse('2026-07-01T00:00:00Z');
  const e = ev();
  it('is unknown until the live numbers arrive', () => {
    expect(placesState(e, undefined, now)).toEqual({ kind: 'unknown' });
    expect(placesText({ kind: 'unknown' }, en.events)).toBe('');
  });
  it('says places left, one place left, sold out', () => {
    expect(placesText(placesState(e, { slug: 'x', remaining: 5, soldOut: false, bookable: true }, now), en.events)).toBe('5 places left');
    expect(placesText(placesState(e, { slug: 'x', remaining: 1, soldOut: false, bookable: true }, now), en.events)).toBe('1 place left');
    expect(placesText(placesState(e, { slug: 'x', remaining: 0, soldOut: true, bookable: false }, now), en.events)).toBe('Sold out');
  });
  it('a cancelled or finished workshop never shows places', () => {
    const live = { slug: 'x', remaining: 5, soldOut: false, bookable: true };
    expect(placesState(ev({ status: 'cancelled' }), live, now)).toEqual({ kind: 'cancelled' });
    expect(placesState(e, live, Date.parse('2026-08-01T00:00:00Z'))).toEqual({ kind: 'finished' });
  });
});

describe('calendar month grid (Monday first)', () => {
  it('November 2026 starts on a Sunday, so the first row has six days of October', () => {
    const weeks = buildMonth(2026, 10);
    expect(weeks[0]![6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks).toHaveLength(6); // 30 November is a Monday, so it needs a sixth row
    expect(weeks.at(-1)![0]).toEqual({ date: '2026-11-30', inMonth: true });
    expect(weeks.at(-1)!.at(-1)).toEqual({ date: '2026-12-06', inMonth: false });
  });
  it('February 2027 starts on a Monday and fits four rows', () => {
    const weeks = buildMonth(2027, 1);
    expect(weeks).toHaveLength(4);
    expect(weeks[0]![0]).toEqual({ date: '2027-02-01', inMonth: true });
    expect(weeks[3]![6]).toEqual({ date: '2027-02-28', inMonth: true });
  });
  it('every day of the month appears exactly once as an in-month cell', () => {
    for (const [y, m] of [[2026, 0], [2026, 2], [2028, 1], [2026, 9], [2026, 11]] as const) {
      const days = buildMonth(y, m).flat().filter((c) => c.inMonth).map((c) => c.date);
      expect(days).toHaveLength(new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
      expect(new Set(days).size).toBe(days.length);
    }
  });
  it('moves between months and across the new year', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(monthKey(2026, 2)).toBe('2026-03');
  });
});

describe('events on the calendar', () => {
  it('are placed on their Copenhagen day, even when UTC is a different day', () => {
    // 22:30Z in summer is 00:30 the NEXT day in Copenhagen
    const map = eventsByDay([ev({ slug: 'late', startsAt: '2026-07-14T22:30:00.000Z', endsAt: '2026-07-15T01:30:00.000Z' })]);
    expect([...map.keys()]).toEqual(['2026-07-15']);
  });
  it('are sorted by time within a day', () => {
    const map = eventsByDay([
      ev({ slug: 'pm', startsAt: '2026-07-14T14:00:00.000Z', endsAt: '2026-07-14T16:00:00.000Z' }),
      ev({ slug: 'am', startsAt: '2026-07-14T07:00:00.000Z', endsAt: '2026-07-14T09:00:00.000Z' }),
    ]);
    expect(map.get('2026-07-14')!.map((e) => e.slug)).toEqual(['am', 'pm']);
  });
});
