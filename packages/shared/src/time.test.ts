import { describe, expect, it } from 'vitest';
import { dayInZone, isValidTimeZone, localToUtc, parseLocal, tzOffsetMs, utcToLocal } from './time';

const CPH = 'Europe/Copenhagen';
const utc = (local: string, tz = CPH) => {
  const r = localToUtc(local, tz);
  if (!r.ok) throw new Error(`${local}: ${r.reason}`);
  return r.utc;
};

describe('Copenhagen offsets', () => {
  it('is UTC+1 in winter and UTC+2 in summer', () => {
    expect(tzOffsetMs(Date.parse('2026-01-15T12:00:00Z'), CPH)).toBe(3_600_000);
    expect(tzOffsetMs(Date.parse('2026-07-15T12:00:00Z'), CPH)).toBe(7_200_000);
  });
});

describe('local time to UTC (the admin types Copenhagen time)', () => {
  it('winter: 10:00 is 09:00 UTC', () => {
    expect(utc('2026-01-15T10:00')).toBe('2026-01-15T09:00:00.000Z');
  });
  it('summer: 10:00 is 08:00 UTC', () => {
    expect(utc('2026-07-15T10:00')).toBe('2026-07-15T08:00:00.000Z');
  });
  it('round-trips back to what was typed', () => {
    for (const t of ['2026-01-15T10:00', '2026-07-15T18:30', '2026-12-24T09:05', '2027-06-01T00:00']) {
      expect(utcToLocal(utc(t), CPH)).toBe(t);
    }
  });
});

describe('DST: the last Sunday of March (clocks go forward), 29 March 2026', () => {
  it('00:30 and 01:59 are still winter time', () => {
    expect(utc('2026-03-29T00:30')).toBe('2026-03-28T23:30:00.000Z');
    expect(utc('2026-03-29T01:59')).toBe('2026-03-29T00:59:00.000Z');
  });
  it('02:30 does not exist and is rejected, not silently shifted', () => {
    expect(localToUtc('2026-03-29T02:00', CPH)).toEqual({ ok: false, reason: 'nonexistent' });
    expect(localToUtc('2026-03-29T02:30', CPH)).toEqual({ ok: false, reason: 'nonexistent' });
  });
  it('03:00 is the first summer-time hour', () => {
    expect(utc('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z');
  });
  it('a workshop across the change is one hour shorter than the clock difference', () => {
    // 22:00 on the Saturday evening to 04:00 on Sunday morning is only 5 real hours
    const start = Date.parse(utc('2026-03-28T22:00'));
    const end = Date.parse(utc('2026-03-29T04:00'));
    expect((end - start) / 3_600_000).toBe(5);
  });
});

describe('DST: the last Sunday of October (clocks go back), 25 October 2026', () => {
  it('02:30 happens twice; the first (summer time) is used, and it is flagged', () => {
    expect(localToUtc('2026-10-25T02:30', CPH)).toEqual({ ok: true, utc: '2026-10-25T00:30:00.000Z', ambiguous: true });
  });
  it('01:30 is summer time and 03:00 is winter time, both unambiguous', () => {
    expect(localToUtc('2026-10-25T01:30', CPH)).toEqual({ ok: true, utc: '2026-10-24T23:30:00.000Z', ambiguous: false });
    expect(localToUtc('2026-10-25T03:00', CPH)).toEqual({ ok: true, utc: '2026-10-25T02:00:00.000Z', ambiguous: false });
  });
  it('a workshop across the change is one hour longer than the clock difference', () => {
    const start = Date.parse(utc('2026-10-24T22:00'));
    const end = Date.parse(utc('2026-10-25T04:00'));
    expect((end - start) / 3_600_000).toBe(7);
  });
});

describe('DST in other years (the rule is the last Sunday)', () => {
  it('2027: 28 March and 31 October', () => {
    expect(localToUtc('2027-03-28T02:30', CPH).ok).toBe(false);
    expect(utc('2027-03-28T03:00')).toBe('2027-03-28T01:00:00.000Z');
    expect(localToUtc('2027-10-31T02:30', CPH)).toMatchObject({ ok: true, ambiguous: true });
  });
  it('the day before and after each change is a normal day', () => {
    expect(utc('2026-03-28T10:00')).toBe('2026-03-28T09:00:00.000Z'); // winter
    expect(utc('2026-03-30T10:00')).toBe('2026-03-30T08:00:00.000Z'); // summer
    expect(utc('2026-10-24T10:00')).toBe('2026-10-24T08:00:00.000Z'); // summer
    expect(utc('2026-10-26T10:00')).toBe('2026-10-26T09:00:00.000Z'); // winter
  });
});

describe('other zones and bad input', () => {
  it('works for another zone (New York, 8 March 2026)', () => {
    expect(localToUtc('2026-03-08T02:30', 'America/New_York')).toEqual({ ok: false, reason: 'nonexistent' });
    expect(utc('2026-03-08T12:00', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
  });
  it('rejects text that is not a date, an impossible date, or an unknown zone', () => {
    for (const bad of ['', 'tomorrow', '2026-02-30T10:00', '2026-13-01T10:00', '2026-01-01T25:00', '2026-01-01 10:00', '2026-01-01T10:60']) {
      expect(localToUtc(bad, CPH), bad).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(localToUtc('2026-01-01T10:00', 'Mars/Olympus')).toEqual({ ok: false, reason: 'invalid' });
    expect(isValidTimeZone('Europe/Copenhagen')).toBe(true);
    expect(isValidTimeZone('Nope/Nope')).toBe(false);
  });
  it('accepts a leap day only in a leap year', () => {
    expect(parseLocal('2028-02-29T10:00')).not.toBeNull();
    expect(parseLocal('2027-02-29T10:00')).toBeNull();
  });
});

describe('the calendar day of an instant in the event zone', () => {
  it('late evening Copenhagen time is the next day in UTC, but the same day here', () => {
    expect(dayInZone('2026-07-14T22:30:00.000Z', CPH)).toBe('2026-07-15'); // 00:30 on the 15th in Copenhagen
    expect(dayInZone('2026-07-15T21:30:00.000Z', CPH)).toBe('2026-07-15'); // 23:30 on the 15th
  });
});
