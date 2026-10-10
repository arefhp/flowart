import { describe, expect, it } from 'vitest';
import { boldParts, excerpt, formatDimensions, paragraphs } from './text';

describe('paragraphs (a blank line starts a paragraph; single breaks collapse)', () => {
  it('splits on blank lines', () => {
    expect(paragraphs('One.\n\nTwo.\n  \nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });
  it('collapses single line breaks inside a paragraph', () => {
    expect(paragraphs('Line one\nline two\r\nline three')).toEqual(['Line one line two line three']);
  });
  it('handles empty input', () => {
    expect(paragraphs('')).toEqual([]);
    expect(paragraphs(undefined)).toEqual([]);
    expect(paragraphs('\n\n  \n')).toEqual([]);
  });
});

describe('excerpt', () => {
  it('uses the first paragraph and cuts long text at a word', () => {
    expect(excerpt('Short.\n\nSecond.')).toBe('Short.');
    const long = excerpt('word '.repeat(80), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('boldParts', () => {
  it('marks **bold** segments', () => {
    expect(boldParts('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
  });
});

describe('formatDimensions: only the sizes that exist', () => {
  it('shows nothing when there are none', () => {
    expect(formatDimensions('en-GB', undefined)).toBeNull();
    expect(formatDimensions('en-GB', {})).toBeNull();
  });
  it('joins the ones present', () => {
    expect(formatDimensions('en-GB', { width_cm: 50, height_cm: 70 })).toBe('50 × 70 cm');
    expect(formatDimensions('en-GB', { width_cm: 60, height_cm: 80, depth_cm: 2 })).toBe('60 × 80 × 2 cm');
    expect(formatDimensions('en-GB', { height_cm: 70 })).toBe('70 cm');
  });
  it('uses the decimal mark of the language', () => {
    expect(formatDimensions('da-DK', { width_cm: 50.5 })).toBe('50,5 cm');
  });
});
