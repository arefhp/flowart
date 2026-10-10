import type { Locale } from '@flowart/shared';
import '@/styles';

/** The <html> shell. Each language (and the admin) has its own root layout so `lang` is right in the static HTML. */
export function RootHtml({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
