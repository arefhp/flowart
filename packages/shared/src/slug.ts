/** Turn a title into a URL slug: lowercase ASCII, digits and single hyphens. */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    æ: 'ae',
    ø: 'o',
    å: 'a',
    ß: 'ss',
    đ: 'd',
    ł: 'l',
  };
  const base = input
    .toLowerCase()
    .replace(/[æøåßđł]/g, (ch) => map[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'untitled';
}
