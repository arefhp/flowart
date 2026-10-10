import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

const html = (md: string) => renderToStaticMarkup(<div>{renderMarkdown(md)}</div>);

describe('admin help markdown renderer', () => {
  it('renders headings and paragraphs', () => {
    const out = html('# Title\n\nSome text\nmore text.\n\n## Part');
    expect(out).toContain('<h1');
    expect(out).toContain('Some text more text.');
    expect(out).toContain('<h2');
  });

  it('renders numbered lists with nested bullets', () => {
    const out = html('1. First\n   - inner a\n   - inner b\n2. Second');
    expect(out.match(/<ol/g)).toHaveLength(1);
    expect(out.match(/<ul/g)).toHaveLength(1);
    expect(out).toMatch(/<li>First<ul[^>]*><li>inner a<\/li><li>inner b<\/li><\/ul><\/li><li>Second<\/li>/);
  });

  it('renders tables', () => {
    const out = html('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(out).toContain('<table');
    expect(out).toContain('<th scope="col"');
    expect(out).toMatch(/<td[^>]*>1<\/td>/);
  });

  it('renders bold and code, and escapes HTML', () => {
    const out = html('A **bold** and `code` and <script>alert(1)</script>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<code');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('external links open safely; links to other documents are plain text', () => {
    const out = html('[Cloudflare](https://example.com) and [guide](LOCAL_DEVELOPMENT.md) and [x](javascript:alert(1))');
    expect(out).toMatch(/<a [^>]*href="https:\/\/example.com"[^>]*rel="noopener noreferrer"/);
    expect(out).not.toContain('LOCAL_DEVELOPMENT.md"');
    expect(out).not.toContain('javascript:');
  });

  it('renders the real admin guide without throwing', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const guide = readFileSync(join(process.cwd(), '..', '..', 'docs', 'ADMIN_GUIDE.md'), 'utf8');
    const out = html(guide);
    expect(out).toContain('Signing in');
    expect(out).toContain('<table');
  });
});
