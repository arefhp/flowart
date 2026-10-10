'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi } from '@/lib/admin-api';
import { Notice, PageTitle } from './ui';

interface Message {
  id: string;
  name: string;
  email: string;
  message: string;
  locale: 'en' | 'da';
  created_at: string;
  artwork_title: string | null;
  artwork_slug: string | null;
}

/** Everything visitors wrote through the contact form. Each one was also emailed to info@zfadavi.com. */
export function MessagesAdmin() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .get<{ messages: Message[] }>('/messages')
      .then((r) => setMessages(r.messages))
      .catch((e: unknown) => setError(e instanceof AdminApiError ? e.message : 'Could not load the messages.'));
  }, []);

  return (
    <div>
      <PageTitle>Messages</PageTitle>
      <p className="mb-8 max-w-2xl text-stone">
        Every contact-form message is saved here and emailed to info@zfadavi.com. To answer, press Reply in your email: the visitor's address is the reply address.
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {messages === null && !error ? <p className="text-stone">Loading...</p> : null}
      {messages && messages.length === 0 ? <Notice kind="info">No messages yet.</Notice> : null}
      <ul className="space-y-6">
        {messages?.map((m) => (
          <li key={m.id} className="border border-hairline bg-paper p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="font-serif text-lg">{m.name}</p>
              <p className="text-sm text-stone">
                <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                {m.locale === 'da' ? ', wrote in Danish' : ''}
              </p>
            </div>
            <p className="text-sm">
              <a className="link" href={`mailto:${m.email}`}>
                {m.email}
              </a>
              {m.artwork_title ? (
                <>
                  {' '}
                  about{' '}
                  {m.artwork_slug ? (
                    <Link className="link" href={`/artworks/${m.artwork_slug}`} target="_blank">
                      {m.artwork_title}
                    </Link>
                  ) : (
                    m.artwork_title
                  )}
                </>
              ) : null}
            </p>
            <p className="mt-3 whitespace-pre-wrap">{m.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
