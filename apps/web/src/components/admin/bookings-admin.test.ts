import { describe, expect, it } from 'vitest';
import { untilStart } from './BookingsAdmin';

const HOUR = 3_600_000;
const NOW = Date.parse('2030-05-01T12:00:00Z');

describe('time until a workshop starts (for the 24-hour refund rule)', () => {
  it('counts hours below two days, then days', () => {
    expect(untilStart(new Date(NOW + 5 * HOUR).toISOString(), NOW)).toMatchObject({ hours: 5, text: 'it starts in 5 hours' });
    expect(untilStart(new Date(NOW + 1 * HOUR).toISOString(), NOW).text).toBe('it starts in 1 hour');
    expect(untilStart(new Date(NOW + 30 * HOUR).toISOString(), NOW).text).toBe('it starts in 30 hours');
    expect(untilStart(new Date(NOW + 72 * HOUR).toISOString(), NOW).text).toBe('it starts in 3 days');
  });

  it('knows when the 24-hour line is crossed, and when the workshop has started', () => {
    expect(untilStart(new Date(NOW + 24 * HOUR).toISOString(), NOW).hours).toBeGreaterThanOrEqual(24);
    expect(untilStart(new Date(NOW + 23.9 * HOUR).toISOString(), NOW).hours).toBeLessThan(24);
    expect(untilStart(new Date(NOW - HOUR).toISOString(), NOW).text).toBe('it has already started');
  });
});
