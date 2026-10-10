'use client';

import { LIMITS, variantUrl } from '@flowart/shared';
import { useEffect, useRef, useState } from 'react';
import { AdminApiError, adminApi } from '@/lib/admin-api';
import { ACCEPT_ATTR, ImagePrepError, prepareImage, uploadFormData } from '@/lib/image-resize';
import { announceContentSaved } from './AdminShell';
import { Field, Notice, PageTitle, charCount, useUnsavedWarning } from './ui';

interface AboutData {
  heading: string | null;
  heading_da: string | null;
  body: string;
  body_da: string | null;
  portrait: { url: string; alt: string | null; alt_da: string | null; width: number; height: number } | null;
}

/** The About page: statement in English and Danish, plus the portrait (shown in its exact 4:5 crop). */
export function AboutAdmin() {
  const [data, setData] = useState<AboutData | null>(null);
  const [form, setForm] = useState({ heading: '', heading_da: '', body: '', body_da: '', portrait_alt: '', portrait_alt_da: '' });
  const [saved, setSaved] = useState(form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);

  function load(d: AboutData) {
    setData(d);
    const next = {
      heading: d.heading ?? '',
      heading_da: d.heading_da ?? '',
      body: d.body,
      body_da: d.body_da ?? '',
      portrait_alt: d.portrait?.alt ?? '',
      portrait_alt_da: d.portrait?.alt_da ?? '',
    };
    setForm(next);
    setSaved(next);
  }

  useEffect(() => {
    // Ignore a response that arrives after this effect was replaced (React runs effects twice in
    // development); otherwise a late reply would overwrite what the owner has already typed.
    let current = true;
    adminApi
      .get<AboutData>('/about')
      .then((d) => {
        if (current) load(d);
      })
      .catch(() => {
        if (current) setMessage({ kind: 'error', text: 'Could not load the About page.' });
      });
    return () => {
      current = false;
    };
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await adminApi.put<AboutData>('/about', form);
      load(result);
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

  if (!data) return message ? <Notice kind="error">{message.text}</Notice> : <p className="text-stone">Loading...</p>;

  return (
    <div className="space-y-12">
      <PageTitle>About</PageTitle>
      <form onSubmit={save} noValidate className="space-y-6">
        <p className="max-w-2xl text-sm text-stone">
          Leave a blank line between paragraphs. Text only, no formatting needed. English is required; until you add Danish, the Danish About page shows the English
          text.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="heading" label="Heading (English, optional)" error={errors.heading}>
            <input id="heading" className="field" value={form.heading} maxLength={LIMITS.aboutHeadingMax} onChange={(e) => set('heading', e.target.value)} />
          </Field>
          <Field id="heading_da" label="Heading (Danish, optional)" error={errors.heading_da}>
            <input id="heading_da" lang="da" className="field" value={form.heading_da} maxLength={LIMITS.aboutHeadingMax} onChange={(e) => set('heading_da', e.target.value)} />
          </Field>
          <Field id="body" label="Text (English)" hint={charCount(form.body, LIMITS.aboutBodyMax)} error={errors.body}>
            <textarea id="body" className="field" rows={16} value={form.body} maxLength={LIMITS.aboutBodyMax} onChange={(e) => set('body', e.target.value)} />
          </Field>
          <Field id="body_da" label="Text (Danish, optional)" hint={charCount(form.body_da, LIMITS.aboutBodyMax)} error={errors.body_da}>
            <textarea id="body_da" lang="da" className="field" rows={16} value={form.body_da} maxLength={LIMITS.aboutBodyMax} onChange={(e) => set('body_da', e.target.value)} />
          </Field>
          {data.portrait ? (
            <>
              <Field id="portrait_alt" label="Portrait alt text (English, required)" error={errors.portrait_alt} hint="Describe the photo, for example: Portrait of the artist in her studio.">
                <input id="portrait_alt" className="field" value={form.portrait_alt} maxLength={LIMITS.altTextMax} onChange={(e) => set('portrait_alt', e.target.value)} />
              </Field>
              <Field id="portrait_alt_da" label="Portrait alt text (Danish, optional)" error={errors.portrait_alt_da}>
                <input id="portrait_alt_da" lang="da" className="field" value={form.portrait_alt_da} maxLength={LIMITS.altTextMax} onChange={(e) => set('portrait_alt_da', e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {dirty ? <span className="text-sm text-stone">Unsaved changes</span> : null}
        </div>
      </form>
      <Portrait data={data} onChange={load} />
    </div>
  );
}

function Portrait({ data, onChange }: { data: AboutData; onChange: (d: AboutData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [altDa, setAltDa] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(files: FileList | null) {
    if (files?.[0]) {
      setFile(files[0]);
      setNotice(null);
    }
  }

  async function upload() {
    if (!file) return;
    if (!alt.trim()) {
      setNotice({ kind: 'error', text: 'Please describe the portrait in the alt text field.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const prepared = await prepareImage(file);
      const result = await adminApi.upload<AboutData>('/about/portrait', uploadFormData(prepared, { portrait_alt: alt, portrait_alt_da: altDa }));
      onChange(result);
      setFile(null);
      setAlt('');
      setAltDa('');
      announceContentSaved();
      setNotice({ kind: 'success', text: 'Portrait saved. The public site updates in a few minutes.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ImagePrepError || err instanceof AdminApiError ? err.message : 'The upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Remove the portrait? The About page will then show only the text.')) return;
    try {
      onChange(await adminApi.delete<AboutData>('/about/portrait'));
      announceContentSaved();
      setNotice({ kind: 'success', text: 'Portrait removed.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof AdminApiError ? err.message : 'Could not remove the portrait.' });
    }
  }

  return (
    <section aria-labelledby="portrait-heading" className="space-y-5">
      <h2 id="portrait-heading" className="text-xl">
        Portrait
      </h2>
      <p className="max-w-2xl text-sm text-stone">
        A portrait-orientation photo works best, at least 1200 px tall. The preview shows exactly how it is cropped on the page. Without a portrait, the About page shows
        only the text.
      </p>
      <div className="grid gap-8 sm:grid-cols-[14rem_1fr]">
        <div>
          <div className="aspect-[4/5] w-56 overflow-hidden bg-hairline">
            {preview || data.portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview ?? variantUrl(data.portrait!.url, 480)}
                alt={preview ? 'Preview of the new portrait' : (data.portrait?.alt ?? '')}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center p-4 text-center text-sm text-stone">No portrait yet</div>
            )}
          </div>
          <p className="mt-2 text-sm text-stone">{preview ? 'New portrait (not saved yet)' : data.portrait ? 'Current portrait' : ''}</p>
        </div>
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={`border border-dashed p-5 ${dragging ? 'border-lapis bg-paper' : 'border-[#aeb2ab]'}`}
          >
            <p className="mb-3">Drag a photo here, or</p>
            <button type="button" className="btn" onClick={() => input.current?.click()}>
              {data.portrait ? 'Replace portrait' : 'Choose a photo'}
            </button>
            <input ref={input} type="file" accept={ACCEPT_ATTR} className="sr-only" aria-label="Choose the portrait photo" onChange={(e) => pick(e.target.files)} />
            {file ? <p className="mt-3 text-sm text-stone">{file.name}</p> : null}
          </div>
          {file ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="new_alt" label="Alt text (English, required)">
                <input id="new_alt" className="field" value={alt} maxLength={LIMITS.altTextMax} onChange={(e) => setAlt(e.target.value)} />
              </Field>
              <Field id="new_alt_da" label="Alt text (Danish, optional)">
                <input id="new_alt_da" lang="da" className="field" value={altDa} maxLength={LIMITS.altTextMax} onChange={(e) => setAltDa(e.target.value)} />
              </Field>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" className="btn btn-primary" onClick={upload} disabled={busy}>
                  {busy ? 'Uploading...' : 'Save portrait'}
                </button>
                <button type="button" className="btn" onClick={() => setFile(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {data.portrait && !file ? (
            <button type="button" className="btn text-alert" onClick={remove}>
              Remove portrait
            </button>
          ) : null}
          {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
        </div>
      </div>
    </section>
  );
}
