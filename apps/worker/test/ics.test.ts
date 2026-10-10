import { describe, expect, it } from 'vitest';
import { buildIcs, icsDate, icsEscape, icsFold } from '../src/lib/ics';

describe('ics helpers', () => {
  it('writes UTC dates the calendar way', () => {
    expect(icsDate('2030-05-10T08:00:00.000Z')).toBe('20300510T080000Z');
    expect(icsDate('2026-10-25T00:30:00.000Z')).toBe('20261025T003000Z');
  });

  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(icsEscape('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('leaves short lines alone and folds long ones at 75 bytes', () => {
    expect(icsFold('SUMMARY:short')).toBe('SUMMARY:short');
    const folded = icsFold('X:' + 'a'.repeat(200));
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(new TextEncoder().encode(lines[0]!).length).toBeLessThanOrEqual(75);
    for (const l of lines.slice(1)) {
      expect(l.startsWith(' ')).toBe(true);
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe('X:' + 'a'.repeat(200));
  });

  it('never cuts a multi-byte character in half', () => {
    const text = 'X:' + 'æøå'.repeat(60);
    const folded = icsFold(text);
    expect(folded.replace(/\r\n /g, '')).toBe(text);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('builds a complete calendar with stable fields', () => {
    const ics = buildIcs({
      uid: 'abc@zfadavi.com',
      title: 'Workshop',
      startsAtIso: '2030-05-10T08:00:00.000Z',
      endsAtIso: '2030-05-10T11:00:00.000Z',
      modifiedIso: '2030-01-01T00:00:00.000Z',
    });
    expect(ics).toContain('PRODID:-//Zakereh Art//Workshops//EN');
    expect(ics).toContain('DTSTAMP:20300101T000000Z');
    expect(ics).not.toContain('DESCRIPTION'); // optional fields are left out when empty
    expect(ics).not.toContain('LOCATION');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});
