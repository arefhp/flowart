import { localePath, type Locale } from '@flowart/shared';
import Link from 'next/link';
import { getDict } from '@/i18n/dictionary';
import { getSocial } from '@/lib/api';
import { SocialLinks } from './SocialLinks';

/**
 * Header, footer and language switch around every public page. `path` is the language-neutral
 * path of the current page, so the switcher can link to the same page in the other language.
 */
export async function SiteShell({
  locale,
  path,
  children,
}: {
  locale: Locale;
  path: string;
  children: React.ReactNode;
}) {
  const t = getDict(locale);
  const social = await getSocial();
  const other: Locale = locale === 'en' ? 'da' : 'en';
  const navItems = [
    { href: localePath(locale, '/artworks'), label: t.nav.artworks, active: path.startsWith('/artworks') },
    { href: localePath(locale, '/workshops'), label: t.nav.workshops, active: path.startsWith('/workshops') },
    { href: localePath(locale, '/calendar'), label: t.nav.calendar, active: path === '/calendar' },
    { href: localePath(locale, '/about'), label: t.nav.about, active: path === '/about' },
    { href: localePath(locale, '/contact'), label: t.nav.contact, active: path === '/contact' },
  ];

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-paper focus:px-4 focus:py-2 focus:shadow"
      >
        {t.skipToContent}
      </a>
      <header className="mx-auto flex max-w-[88rem] flex-wrap items-baseline justify-between gap-x-10 gap-y-2 px-6 pb-4 pt-6 md:px-10">
        <Link href={localePath(locale, '/')} className="font-serif text-[1.6rem] leading-none tracking-tight">
          {t.siteName}
        </Link>
        <nav aria-label={t.nav.label} className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[0.95rem]">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center underline-offset-[0.45em] decoration-1 hover:underline ${item.active ? 'underline' : ''}`}
            >
              {item.label}
            </Link>
          ))}
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <Link
            href={localePath(other, path)}
            hrefLang={other}
            lang={other}
            aria-label={`${t.language.label}: ${t.language[other]}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-stone hover:text-ink"
          >
            {other.toUpperCase()}
          </Link>
        </nav>
      </header>

      <div id="main" tabIndex={-1} className="outline-none">
        {children}
      </div>

      <footer className="mx-auto mt-28 max-w-[88rem] border-t border-hairline px-6 py-10 text-[0.95rem] md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-x-12 gap-y-8">
          <div className="max-w-sm">
            <p className="font-serif text-xl">{t.siteName}</p>
            <p className="mt-1 text-stone">{t.tagline}</p>
          </div>
          <SocialLinks links={social} t={t} showHeading />
          <ul className="flex gap-x-6 text-stone">
            <li>
              <Link className="inline-flex min-h-[44px] items-center link" href={localePath(locale, '/privacy')}>
                {t.footer.privacy}
              </Link>
            </li>
            <li>
              <Link className="inline-flex min-h-[44px] items-center link" href={localePath(locale, '/terms')}>
                {t.footer.terms}
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </>
  );
}
