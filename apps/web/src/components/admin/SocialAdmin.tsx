'use client';

import { SOCIAL_PLATFORMS, normalizeSocialUrl, platformLabel, type SocialPlatform } from '@flowart/shared';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi } from '@/lib/admin-api';
import { announceContentSaved } from './AdminShell';
import { Notice, PageTitle, useUnsavedWarning } from './ui';

interface Row {
  key: string;
  id: string | null;
  platform: SocialPlatform;
  url: string;
  label: string;
  visible: boolean;
}

const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  x: 'X',
  behance: 'Behance',
  other: 'Other',
};

let counter = 0;
const newKey = () => `row-${++counter}`;

/**
 * Social links shown in the footer and on the Contact and About pages. A link is cleaned of
 * tracking bits when saved; the form previews the exact result ("Will be saved as").
 */
export function SocialAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const serialized = JSON.stringify(rows?.map(({ key: _k, ...r }) => r));
  const dirty = rows !== null && serialized !== saved;
  useUnsavedWarning(dirty);

  function load(links: Array<{ id: string; platform: SocialPlatform; url: string; label: string | null; visible: boolean }>) {
    const next = links.map<Row>((l) => ({ key: newKey(), id: l.id, platform: l.platform, url: l.url, label: l.label ?? '', visible: l.visible }));
    setRows(next);
    setSaved(JSON.stringify(next.map(({ key: _k, ...r }) => r)));
  }

  useEffect(() => {
    // Ignore a late reply from a replaced effect (React runs effects twice in development), so it
    // can never overwrite what the owner has already changed.
    let current = true;
    adminApi
      .get<{ links: Parameters<typeof load>[0] }>('/social')
      .then((r) => {
        if (current) load(r.links);
      })
      .catch(() => {
        if (current) setMessage({ kind: 'error', text: 'Could not load the links.' });
      });
    return () => {
      current = false;
    };
  }, []);

  const update = (key: string, patch: Partial<Row>) => {
    setRows((r) => r?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? r);
    setMessage(null);
  };
  const move = (index: number, delta: number) =>
    setRows((r) => {
      if (!r) return r;
      const next = [...r];
      const target = index + delta;
      if (target < 0 || target >= next.length) return r;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  function add() {
    const used = new Set(rows?.map((r) => r.platform));
    const platform = (SOCIAL_PLATFORMS.find((p) => p !== 'other' && !used.has(p)) ?? 'other') as SocialPlatform;
    setRows((r) => [...(r ?? []), { key: newKey(), id: null, platform, url: '', label: '', visible: true }]);
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await adminApi.put<{ links: Parameters<typeof load>[0] }>('/social', {
        links: rows.map((r) => ({ id: r.id, platform: r.platform, url: r.url, label: r.label.trim() || null, visible: r.visible })),
      });
      load(result.links);
      setErrors({});
      setMessage({ kind: 'success', text: 'Saved. The public site updates in a few minutes.' });
      announceContentSaved();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrors(err.fields);
        setMessage({ kind: 'error', text: err.message });
      } else throw err;
    } finally {
      setSaving(false);
    }
  }

  if (rows === null) return message ? <Notice kind="error">{message.text}</Notice> : <p className="text-stone">Loading...</p>;

  return (
    <div className="space-y-8">
      <PageTitle>Social links</PageTitle>
      <p className="max-w-2xl text-stone">
        These links appear in the footer of every page and on the Contact and About pages. Paste the link from your browser or the app's Share button; tracking bits are removed
        automatically. Turn a link off with the Visible switch to hide it without losing it. If every link is hidden, no social section is shown at all.
      </p>
      <p className="max-w-2xl text-sm text-stone">
        Your Facebook link is a share link (facebook.com/share/...). It works, but if your page has a permanent address like facebook.com/your-page-name, using that is more
        stable.
      </p>

      {rows.length === 0 ? <Notice kind="info">No social links yet. Add your Instagram, Facebook or TikTok.</Notice> : null}

      <ul className="space-y-5">
        {rows.map((row, i) => {
          const preview = row.url.trim() ? normalizeSocialUrl(row.platform, row.url) : null;
          const urlError = errors[`links.${i}.url`] ?? (preview && !preview.ok ? preview.error : undefined);
          return (
            <li key={row.key} className="grid gap-4 border border-hairline bg-paper p-4 md:grid-cols-[11rem_1fr]">
              <div>
                <label className="mb-1 block text-sm" htmlFor={`p-${row.key}`}>
                  Platform
                </label>
                <select id={`p-${row.key}`} className="field" value={row.platform} onChange={(e) => update(row.key, { platform: e.target.value as SocialPlatform })}>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_NAMES[p]}
                    </option>
                  ))}
                </select>
                {errors[`links.${i}.platform`] ? <p role="alert" className="mt-1 text-sm text-alert">{errors[`links.${i}.platform`]}</p> : null}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm" htmlFor={`u-${row.key}`}>
                    Link
                  </label>
                  <input
                    id={`u-${row.key}`}
                    className="field"
                    value={row.url}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`https://... (${platformLabel(row.platform)})`}
                    aria-invalid={Boolean(urlError)}
                    aria-describedby={`u-${row.key}-note`}
                    onChange={(e) => update(row.key, { url: e.target.value })}
                  />
                  <p id={`u-${row.key}-note`} className="mt-1 text-sm">
                    {urlError ? (
                      <span role="alert" className="text-alert">
                        {urlError}
                      </span>
                    ) : preview?.ok ? (
                      <span className="text-stone">
                        Will be saved as: <span className="break-all text-ink">{preview.url}</span>
                      </span>
                    ) : null}
                  </p>
                </div>
                {row.platform === 'other' ? (
                  <div>
                    <label className="mb-1 block text-sm" htmlFor={`l-${row.key}`}>
                      Name shown on the site (required)
                    </label>
                    <input id={`l-${row.key}`} className="field" value={row.label} maxLength={60} onChange={(e) => update(row.key, { label: e.target.value })} />
                    {errors[`links.${i}.label`] ? <p role="alert" className="mt-1 text-sm text-alert">{errors[`links.${i}.label`]}</p> : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-3 flex min-h-[44px] items-center gap-2">
                    <input type="checkbox" className="h-5 w-5" checked={row.visible} onChange={(e) => update(row.key, { visible: e.target.checked })} />
                    Visible
                  </label>
                  <button type="button" className="btn" onClick={() => move(i, -1)} disabled={i === 0}>
                    Move up
                  </button>
                  <button type="button" className="btn" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                    Move down
                  </button>
                  {preview?.ok ? (
                    <a className="btn" href={preview.url} target="_blank" rel="noopener noreferrer">
                      Open link
                    </a>
                  ) : null}
                  <button type="button" className="btn text-alert" onClick={() => setRows((r) => r?.filter((x) => x.key !== row.key) ?? r)}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn" onClick={add} disabled={rows.length >= 12}>
          Add link
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {dirty ? <span className="text-sm text-stone">Unsaved changes</span> : null}
      </div>
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
    </div>
  );
}
