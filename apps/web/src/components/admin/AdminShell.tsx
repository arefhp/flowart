'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, SESSION_ENDED_EVENT, adminApi, type RebuildStatus } from '@/lib/admin-api';

const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/artworks', label: 'Artworks' },
  { href: '/admin/about', label: 'About' },
  { href: '/admin/social', label: 'Social links' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/help', label: 'Help' },
];

const STATE_LABEL: Record<RebuildStatus['state'], { text: string; color: string }> = {
  pending: { text: 'Rebuilding the site', color: 'text-[#8a5a00]' },
  done: { text: 'Site up to date', color: 'text-[#1d4a35]' },
  failed: { text: 'Rebuild failed', color: 'text-alert' },
  skipped: { text: 'Rebuild skipped (local)', color: 'text-stone' },
};

/**
 * Frame for every admin page: navigation, the "Local development mode" banner (only when the
 * Worker reports the dev bypass), the "session ended" message, and the site-rebuild indicator.
 * Access performs the real sign-in before any admin page is served, so there is no login page.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, '') || '/admin';
  const [me, setMe] = useState<{ email: string; devMode: boolean } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [status, setStatus] = useState<RebuildStatus | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    const onEnded = () => setSessionEnded(true);
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);

  useEffect(() => {
    adminApi
      .get<{ email: string; devMode: boolean }>('/me')
      .then(setMe)
      .catch(() => undefined);
  }, []);

  const refreshStatus = useCallback(() => {
    adminApi
      .get<RebuildStatus>('/site/status')
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  // poll while a rebuild is pending, otherwise just check now and then
  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, status?.state === 'pending' ? 10_000 : 60_000);
    return () => clearInterval(id);
  }, [refreshStatus, status?.state]);

  // pages announce a saved change so the indicator updates straight away
  useEffect(() => {
    const onChange = () => setTimeout(refreshStatus, 400);
    window.addEventListener('admin-content-saved', onChange);
    return () => window.removeEventListener('admin-content-saved', onChange);
  }, [refreshStatus]);

  async function rebuild() {
    setRebuilding(true);
    try {
      const res = await adminApi.post<{ status: RebuildStatus }>('/site/rebuild', {});
      setStatus(res.status);
    } catch (err) {
      if (!(err instanceof AdminApiError)) throw err;
    } finally {
      setRebuilding(false);
    }
  }

  const label = status ? STATE_LABEL[status.state] : null;

  return (
    <div className="min-h-screen bg-wall">
      {me?.devMode ? (
        <p className="bg-ink px-4 py-1.5 text-center text-sm text-wall">Local development mode</p>
      ) : null}
      <header className="border-b border-hairline bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
            <Link href="/admin" className="font-serif text-xl">
              Zakereh Art admin
            </Link>
            <nav aria-label="Admin" className="flex flex-wrap gap-x-5 text-[0.95rem]">
              {NAV.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-[44px] items-center underline-offset-[0.45em] hover:underline ${active ? 'underline' : ''}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {label ? (
              <span className={label.color} title={status?.message}>
                {label.text}
              </span>
            ) : null}
            <button type="button" className="btn" onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? 'Starting...' : 'Rebuild site'}
            </button>
          </div>
        </div>
        {status ? <p className="sr-only" role="status">{status.message}</p> : null}
      </header>

      {sessionEnded ? (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <p role="alert" className="border-l-4 border-alert bg-paper px-4 py-3 text-alert">
            Your session ended.{' '}
            <button type="button" className="link" onClick={() => window.location.reload()}>
              Reload the page to sign in again.
            </button>
          </p>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}

/** Tell the shell that content changed so its rebuild indicator refreshes. */
export function announceContentSaved() {
  window.dispatchEvent(new Event('admin-content-saved'));
}
