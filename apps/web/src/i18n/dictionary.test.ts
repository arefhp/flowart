import { describe, expect, it } from 'vitest';
import { da, en, fmt, formatPrice } from './dictionary';

/** Every leaf path of a nested object, e.g. "artwork.close". */
function leaves(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') acc[path] = value;
    else Object.assign(acc, leaves(value as Record<string, unknown>, path));
    return acc;
  }, {});
}

const enLeaves = leaves(en);
const daLeaves = leaves(da);

describe('translations (spec 16.1)', () => {
  it('every key exists in BOTH languages', () => {
    expect(Object.keys(daLeaves).sort()).toEqual(Object.keys(enLeaves).sort());
  });

  it('no string is empty', () => {
    for (const [k, v] of [...Object.entries(enLeaves), ...Object.entries(daLeaves)]) expect(v.trim(), k).not.toBe('');
  });

  it('placeholders such as {title}, {n} and {total} are the same in both languages', () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(enLeaves)) expect(tokens(daLeaves[key]!), key).toBe(tokens(enLeaves[key]!));
  });

  it('Danish is actually translated (not a copy of the English)', () => {
    const same = Object.keys(enLeaves).filter((k) => enLeaves[k] === daLeaves[k]);
    // names, "Status", "Workshops" and "Resin"-style words are the same in both languages
    expect(same.length, `identical in both languages: ${same.join(', ')}`).toBeLessThan(14);
  });

  it('uses the reviewed Danish wording (docs/LANGUAGE_REVIEW.md)', () => {
    expect(da.nav.about).toBe('Om mig');
    expect(da.artwork.medium).toBe('Materialer og teknik');
    expect(da.artwork.ask).toBe('Spørg til værket');
    expect(da.footer.follow).toBe('Følg mig');
    expect(da.footer.privacy).toBe('Privatlivspolitik');
    expect(en.artwork.ask).toBe('Ask about this work');
  });

  it('never mentions VAT or moms, or a phone number', () => {
    const all = [...Object.values(enLeaves), ...Object.values(daLeaves)].join(' ');
    expect(all).not.toMatch(/\b(vat|moms)\b/i);
    expect(all).not.toMatch(/\+?\d[\d ]{7,}\d/);
  });
});

describe('fmt and formatPrice', () => {
  it('fills placeholders', () => {
    expect(fmt('Image {n} of {total}', { n: 2, total: 5 })).toBe('Image 2 of 5');
    expect(fmt('Hello {name}', {})).toBe('Hello ');
  });

  it('formats prices per language without cents for whole amounts', () => {
    expect(formatPrice('en', 1_200_000, 'DKK')).toMatch(/12,000/);
    expect(formatPrice('da', 1_200_000, 'DKK')).toMatch(/12\.000/);
    expect(formatPrice('en', 12_550, 'DKK')).toMatch(/125\.50/);
  });
});
