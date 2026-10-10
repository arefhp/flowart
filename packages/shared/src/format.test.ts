import { describe, expect, it } from 'vitest';
import { formatEventDate, formatEventTimes, formatMoney } from './format';

const CPH = 'Europe/Copenhagen';

describe('workshop date and time (shown in the workshop\'s own time zone)', () => {
  it('summer 08:00 UTC is 10:00 in Copenhagen, winter 09:00 UTC is 10:00', () => {
    expect(formatEventTimes('2030-05-10T08:00:00.000Z', '2030-05-10T11:00:00.000Z', CPH, 'en')).toBe('10:00–13:00');
    expect(formatEventTimes('2030-12-10T09:00:00.000Z', '2030-12-10T12:00:00.000Z', CPH, 'en')).toBe('10:00–13:00');
  });

  it('Danish writes the time with a dot', () => {
    expect(formatEventTimes('2030-05-10T08:00:00.000Z', '2030-05-10T11:00:00.000Z', CPH, 'da')).toBe('10.00–13.00');
  });

  it('a workshop across midnight shows both days', () => {
    const text = formatEventTimes('2030-05-10T20:00:00.000Z', '2030-05-11T07:00:00.000Z', CPH, 'en');
    expect(text).toContain('10 May');
    expect(text).toContain('11 May');
    expect(text).toContain('22:00');
    expect(text).toContain('09:00');
  });

  it('formats the date in each language', () => {
    expect(formatEventDate('2030-05-10T08:00:00.000Z', CPH, 'en')).toBe('Friday, 10 May 2030');
    expect(formatEventDate('2030-05-10T08:00:00.000Z', CPH, 'da')).toContain('fredag');
  });

  it('the day follows the workshop zone, not the server: 23:30 UTC is already tomorrow in Copenhagen', () => {
    expect(formatEventDate('2030-05-10T23:30:00.000Z', CPH, 'en')).toContain('11 May');
  });
});

describe('money', () => {
  it('leaves out the cents when the amount is whole', () => {
    expect(formatMoney('en', 55000, 'DKK').normalize('NFKC')).toBe('DKK 550');
    expect(formatMoney('en', 55050, 'DKK').normalize('NFKC')).toBe('DKK 550.50');
    expect(formatMoney('da', 55000, 'DKK').normalize('NFKC')).toBe('550 kr.');
  });
});
