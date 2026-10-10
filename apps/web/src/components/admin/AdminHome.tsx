'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminApi, type AdminArtworkRow, type RebuildStatus } from '@/lib/admin-api';
import { PageTitle } from './ui';

/** Landing page: what needs attention and where to go next. */
export function AdminHome() {
  const [artworks, setArtworks] = useState<AdminArtworkRow[] | null>(null);
  const [status, setStatus] = useState<RebuildStatus | null>(null);

  useEffect(() => {
    adminApi.get<{ artworks: AdminArtworkRow[] }>('/artworks').then((r) => setArtworks(r.artworks)).catch(() => undefined);
    adminApi.get<RebuildStatus>('/site/status').then(setStatus).catch(() => undefined);
  }, []);

  const noImage = artworks?.filter((a) => a.image_count === 0) ?? [];
  const visible = artworks?.filter((a) => a.status !== 'hidden' && a.image_count > 0).length ?? 0;

  return (
    <div>
      <PageTitle>Overview</PageTitle>
      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="site-heading" className="space-y-2">
          <h2 id="site-heading" className="text-xl">
            The public site
          </h2>
          <p>{status ? status.message : 'Checking...'}</p>
          <p className="text-stone">
            {artworks ? `${visible} artwork${visible === 1 ? '' : 's'} shown in the gallery, ${artworks.length} in total.` : ''}
          </p>
        </section>
        <section aria-labelledby="todo-heading" className="space-y-2">
          <h2 id="todo-heading" className="text-xl">
            Needs attention
          </h2>
          {noImage.length === 0 ? (
            <p className="text-stone">Nothing right now.</p>
          ) : (
            <ul className="list-disc pl-5">
              {noImage.map((a) => (
                <li key={a.id}>
                  <Link className="link" href={`/admin/artworks/edit?id=${a.id}`}>
                    {a.title}
                  </Link>{' '}
                  has no image, so it is not shown publicly.
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section aria-labelledby="go-heading" className="mt-12">
        <h2 id="go-heading" className="mb-3 text-xl">
          Manage
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ['/admin/artworks', 'Artworks', 'Add, edit and organise the gallery.'],
            ['/admin/categories', 'Categories', 'Fine Art, Resin and any others you add.'],
            ['/admin/events', 'Events', 'Create, publish and cancel workshops.'],
            ['/admin/calendar', 'Calendar', 'All workshops by date, with places booked.'],
            ['/admin/about', 'About', 'Your statement and portrait, in English and Danish.'],
            ['/admin/social', 'Social links', 'Instagram, Facebook, TikTok and more.'],
            ['/admin/messages', 'Messages', 'What visitors wrote to you.'],
          ].map(([href, title, text]) => (
            <li key={href}>
              <Link href={href!} className="block border border-hairline bg-paper p-4 hover:border-ink">
                <span className="font-serif text-lg">{title}</span>
                <span className="block text-sm text-stone">{text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
