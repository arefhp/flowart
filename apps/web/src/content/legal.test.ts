import { describe, expect, it } from 'vitest';
import { legalDocs, type LegalDoc } from './legal';

const flat = (d: LegalDoc) =>
  d.blocks.map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text)).join(' ') + ' ' + d.title;

describe('terms and privacy (docs/LANGUAGE_REVIEW.md)', () => {
  for (const kind of ['terms', 'privacy'] as const) {
    it(`${kind}: English and Danish have the same structure`, () => {
      const en = legalDocs[kind].en.blocks;
      const da = legalDocs[kind].da.blocks;
      expect(da.map((b) => b.type)).toEqual(en.map((b) => b.type));
      const lists = (blocks: typeof en) => blocks.filter((b) => b.type === 'ul').map((b) => (b.type === 'ul' ? b.items.length : 0));
      expect(lists(da)).toEqual(lists(en));
    });

    for (const lang of ['en', 'da'] as const) {
      it(`${kind} (${lang}): plain text only, no unfinished markers, VAT, or phone number`, () => {
        const text = flat(legalDocs[kind][lang]);
        expect(text).not.toMatch(/\[(CHECK|FILL)|UDFYLD|CHECK\]/);
        expect(text).not.toMatch(/\b(vat|moms)\b/i);
        expect(text).not.toMatch(/\+?\d[\d ]{7,}\d/);
        expect(text).not.toMatch(/<[a-z]/i); // never raw HTML
        expect(text).toContain('info@zfadavi.com');
        expect(text).toContain('42674249');
      });
    }
  }

  it('the terms state the confirmed refund policy in both languages', () => {
    expect(flat(legalDocs.terms.en)).toMatch(/at least 24 hours before the workshop starts/);
    expect(flat(legalDocs.terms.en)).toMatch(/full refund/);
    expect(flat(legalDocs.terms.da)).toMatch(/senest 24 timer før workshoppen starter/);
    expect(flat(legalDocs.terms.da)).toMatch(/hele beløbet refunderet/);
  });

  it('does not add legal clauses the owner did not approve', () => {
    for (const lang of ['en', 'da'] as const) {
      const text = flat(legalDocs.terms[lang]).toLowerCase();
      for (const banned of ['withdrawal', 'fortrydelsesret', 'liability', 'ansvar', 'governed by', 'forbrugerklagenævn', 'photo', 'foto']) {
        expect(text, `${lang}: ${banned}`).not.toContain(banned);
      }
    }
  });
});
