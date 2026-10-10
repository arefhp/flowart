import type { Dict } from '@/i18n/dictionary';
import type { SocialLink } from '@/lib/types';

/** Neutral monochrome icons that use the current text colour. Shipped inline: no icon font, no CDN. */
const ICONS: Record<string, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: <path d="M14 8.5h3V4.5h-3a4 4 0 0 0-4 4V11H7v4h3v6h4v-6h3l.8-4H14V8.7c0-.1 0-.2 0-.2z" />,
  tiktok: (
    <>
      <path d="M15 3.5v10a3.6 3.6 0 1 1-3.6-3.6" />
      <path d="M15 3.5c.3 2.4 1.9 4 4.5 4.2" />
    </>
  ),
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  pinterest: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 17.5V8.5h3a2.6 2.6 0 0 1 0 5.2h-3" />
    </>
  ),
  x: <path d="M5 5l14 14M19 5L5 19" />,
  behance: (
    <>
      <path d="M4 6.5h5a2.8 2.8 0 0 1 0 5.5H4zM4 12h5.6a2.8 2.8 0 0 1 0 5.5H4z" />
      <path d="M14 8.5h6" />
    </>
  ),
  other: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
};

/**
 * Visible social links, in the owner's order. When there are none this renders NOTHING: no
 * heading, empty list, icons or placeholder text (spec 4B).
 */
export function SocialLinks({ links, t, showHeading = false }: { links: SocialLink[]; t: Dict; showHeading?: boolean }) {
  if (links.length === 0) return null;
  return (
    <div>
      {showHeading ? <p className="text-sm text-stone mb-2">{t.footer.follow}</p> : null}
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {links.map((l) => (
          <li key={`${l.platform}-${l.url}`}>
            <a
              href={l.url}
              target="_blank"
              rel="me noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 hover:underline underline-offset-4"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICONS[l.platform] ?? ICONS.other}
              </svg>
              <span>{l.label}</span>
              <span className="sr-only"> ({t.footer.opensInNewTab})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
