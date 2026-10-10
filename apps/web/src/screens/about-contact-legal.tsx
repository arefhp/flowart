import type { Locale } from '@flowart/shared';
import { Suspense } from 'react';
import { ContactForm } from '@/components/site/ContactForm';
import { Picture } from '@/components/site/Picture';
import { SiteShell } from '@/components/site/SiteShell';
import { SocialLinks } from '@/components/site/SocialLinks';
import { legalDocs } from '@/content/legal';
import { getDict } from '@/i18n/dictionary';
import { getAbout, getSocial } from '@/lib/api';
import { CONTACT_EMAIL } from '@/lib/config';
import { pageMetadata } from '@/lib/seo';
import { boldParts, excerpt, paragraphs } from '@/lib/text';

// ---------------------------------------------------------------- About

export async function aboutMetadata(locale: Locale) {
  const t = getDict(locale);
  const about = await getAbout(locale);
  return pageMetadata({
    locale,
    path: '/about',
    title: t.meta.aboutTitle,
    description: excerpt(about.body) || t.tagline,
    image: about.portrait ? `${about.portrait.url}-1920.webp` : undefined,
  });
}

export async function AboutScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const [about, social] = await Promise.all([getAbout(locale), getSocial()]);
  const text = paragraphs(about.body);
  const portrait = about.portrait;

  const statement = (
    <div>
      <h1 className="mb-8 text-[clamp(2.2rem,5vw,3.6rem)]">{about.heading ?? t.about.title}</h1>
      <div className="prose-artist">
        {text.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {social.length > 0 ? (
        <div className="mt-10">
          <SocialLinks links={social} t={t} showHeading />
        </div>
      ) : null}
    </div>
  );

  return (
    <SiteShell locale={locale} path="/about">
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        {portrait ? (
          // desktop: portrait beside the text (about one third / two thirds); mobile: portrait on top
          <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16">
            <div className="md:sticky md:top-8 md:self-start">
              <div className="aspect-[4/5] w-full overflow-hidden bg-hairline">
                <Picture image={portrait} fit="cover" priority sizes="(min-width: 768px) 30vw, 92vw" />
              </div>
            </div>
            {statement}
          </div>
        ) : (
          // no portrait: text only, centred and readable. No empty frame, placeholder or broken image.
          <div className="mx-auto max-w-[38rem]">{statement}</div>
        )}
      </main>
    </SiteShell>
  );
}

// ---------------------------------------------------------------- Contact

export function contactMetadata(locale: Locale) {
  const t = getDict(locale);
  return pageMetadata({ locale, path: '/contact', title: t.meta.contactTitle, description: t.contact.intro });
}

export async function ContactScreen({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const social = await getSocial();
  return (
    <SiteShell locale={locale} path="/contact">
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:gap-20">
          <div>
            <h1 className="mb-6 text-[clamp(2.2rem,5vw,3.6rem)]">{t.contact.title}</h1>
            <p className="prose-artist mb-10 text-stone">{t.contact.intro}</p>
            <Suspense fallback={null}>
              <ContactForm locale={locale} t={{ contact: t.contact, enquiryMessage: t.artwork.enquiryMessage }} />
            </Suspense>
          </div>
          <aside className="lg:pt-24">
            <p className="text-stone">
              {t.contact.orEmail}{' '}
              <a className="link text-ink" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
            {social.length > 0 ? (
              <div className="mt-8">
                <SocialLinks links={social} t={t} showHeading />
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </SiteShell>
  );
}

// ---------------------------------------------------------------- Terms and privacy

export function legalMetadata(locale: Locale, kind: 'terms' | 'privacy') {
  const t = getDict(locale);
  return pageMetadata({
    locale,
    path: `/${kind}`,
    title: kind === 'terms' ? t.meta.termsTitle : t.meta.privacyTitle,
    description: legalDocs[kind][locale].title,
  });
}

export async function LegalScreen({ locale, kind }: { locale: Locale; kind: 'terms' | 'privacy' }) {
  const doc = legalDocs[kind][locale];
  return (
    <SiteShell locale={locale} path={`/${kind}`}>
      <main className="mx-auto max-w-[88rem] px-6 pt-6 md:px-10">
        <article className="prose-plain">
          <h1 className="mb-6 text-[clamp(2rem,4.5vw,3.2rem)]">{doc.title}</h1>
          {doc.blocks.map((block, i) => {
            if (block.type === 'h2') return <h2 key={i}>{block.text}</h2>;
            if (block.type === 'ul') {
              return (
                <ul key={i}>
                  {block.items.map((item) => (
                    <li key={item} className="mt-2">
                      <Inline text={item} />
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i}>
                <Inline text={block.text} />
              </p>
            );
          })}
        </article>
      </main>
    </SiteShell>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}
