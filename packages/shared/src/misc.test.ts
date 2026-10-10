import { describe, expect, it } from 'vitest';
import { localePath, parseWebpSize, pickText, slugify, stripLocalePrefix } from './index';

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Blue Hour, No. 3!')).toBe('blue-hour-no-3');
    expect(slugify('Røde blomster på æblet')).toBe('rode-blomster-pa-aeblet');
    expect(slugify('   ')).toBe('untitled');
  });
});

describe('pickText (Danish falls back to English)', () => {
  it('uses Danish when present', () => {
    expect(pickText('da', 'Hello', 'Hej')).toBe('Hej');
  });
  it('falls back when Danish is empty, blank or missing', () => {
    expect(pickText('da', 'Hello', '')).toBe('Hello');
    expect(pickText('da', 'Hello', '   ')).toBe('Hello');
    expect(pickText('da', 'Hello', null)).toBe('Hello');
  });
  it('always uses English for en', () => {
    expect(pickText('en', 'Hello', 'Hej')).toBe('Hello');
  });
});

describe('locale paths', () => {
  it('prefixes only Danish', () => {
    expect(localePath('en', '/artworks')).toBe('/artworks');
    expect(localePath('da', '/artworks')).toBe('/da/artworks');
    expect(localePath('da', '/')).toBe('/da');
  });
  it('strips the prefix', () => {
    expect(stripLocalePrefix('/da/artworks/x')).toEqual({ locale: 'da', path: '/artworks/x' });
    expect(stripLocalePrefix('/da')).toEqual({ locale: 'da', path: '/' });
    expect(stripLocalePrefix('/artworks')).toEqual({ locale: 'en', path: '/artworks' });
    expect(stripLocalePrefix('/daily')).toEqual({ locale: 'en', path: '/daily' });
  });
});

describe('parseWebpSize', () => {
  it('rejects non-WebP bytes', () => {
    expect(parseWebpSize(new Uint8Array(64))).toBeNull();
    expect(parseWebpSize(new TextEncoder().encode('<html>'.repeat(20)))).toBeNull();
  });

  it('reads a lossy VP8 header', () => {
    const b = new Uint8Array(40);
    b.set(new TextEncoder().encode('RIFF'), 0);
    b[4] = 32; // riff size
    b.set(new TextEncoder().encode('WEBPVP8 '), 8);
    b[23] = 0x9d;
    b[24] = 0x01;
    b[25] = 0x2a;
    b[26] = 480 & 0xff;
    b[27] = 480 >> 8;
    b[28] = 600 & 0xff;
    b[29] = 600 >> 8;
    expect(parseWebpSize(b)).toEqual({ width: 480, height: 600 });
  });
});
