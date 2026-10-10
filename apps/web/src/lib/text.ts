/**
 * Plain-text rendering rules (spec 4A): a blank line starts a new paragraph, single line breaks
 * inside a paragraph collapse to spaces. Text is always rendered through React (escaped), never as HTML.
 */
export function paragraphs(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** First paragraph, shortened for meta descriptions. */
export function excerpt(text: string | undefined | null, max = 155): string {
  const first = paragraphs(text)[0] ?? '';
  if (first.length <= max) return first;
  return `${first.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Split "a **b** c" into text and bold parts (used by the legal pages). */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

export function formatDimensions(
  locale: string,
  d: { width_cm?: number; height_cm?: number; depth_cm?: number } | undefined,
): string | null {
  if (!d) return null;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const parts = [d.width_cm, d.height_cm, d.depth_cm].filter((v): v is number => typeof v === 'number').map((v) => nf.format(v));
  return parts.length ? `${parts.join(' × ')} cm` : null;
}
