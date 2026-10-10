'use client';

import { LIMITS } from '@flowart/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi, type AdminArtwork, type AdminCategory } from '@/lib/admin-api';
import { announceContentSaved } from './AdminShell';
import { Field, Notice, charCount, useUnsavedWarning } from './ui';

interface FormState {
  title: string;
  title_da: string;
  description: string;
  description_da: string;
  medium: string;
  medium_da: string;
  year: string;
  width_cm: string;
  height_cm: string;
  depth_cm: string;
  price: string;
  currency: string;
  status: AdminArtwork['status'];
  featured: boolean;
  category_id: string;
  size_class: '' | 'small' | 'medium' | 'large';
}

const STATUS_OPTIONS: Array<{ value: AdminArtwork['status']; label: string; help: string }> = [
  { value: 'available', label: 'Available', help: 'Shown in the gallery.' },
  { value: 'reserved', label: 'Reserved', help: 'Shown, marked reserved.' },
  { value: 'sold', label: 'Sold', help: 'Shown, marked sold.' },
  { value: 'hidden', label: 'Hidden', help: 'Not on the public site at all. Use it for drafts.' },
];

const num = (v: number | null) => (v === null ? '' : String(v));
/** minor units (øre) to the number the owner types (12000 DKK, not 1200000) */
const toMajor = (minor: number | null) => (minor === null ? '' : String(minor / 100));

function initial(a: AdminArtwork | null): FormState {
  return {
    title: a?.title ?? '',
    title_da: a?.title_da ?? '',
    description: a?.description ?? '',
    description_da: a?.description_da ?? '',
    medium: a?.medium ?? '',
    medium_da: a?.medium_da ?? '',
    year: num(a?.year ?? null),
    width_cm: num(a?.width_cm ?? null),
    height_cm: num(a?.height_cm ?? null),
    depth_cm: num(a?.depth_cm ?? null),
    price: toMajor(a?.price_minor ?? null),
    currency: a?.currency ?? 'DKK',
    status: a?.status ?? 'hidden',
    featured: a?.featured ?? false,
    category_id: a?.category_id ?? '',
    size_class: a?.size_class ?? '',
  };
}

/** "" means not set. Accepts a comma or a dot as the decimal mark. */
function parseNumber(value: string): number | null | 'invalid' {
  const v = value.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : 'invalid';
}

/**
 * Create or edit an artwork. English and Danish side by side; Danish is optional and falls back
 * to English. A price is optional: leaving it empty saves NO price, so nothing is shown publicly.
 */
export function ArtworkForm({
  artwork,
  onSaved,
}: {
  artwork: AdminArtwork | null;
  onSaved: (saved: AdminArtwork, created: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(artwork));
  const [saved, setSaved] = useState<FormState>(() => initial(artwork));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);

  // the categories the owner has defined; a NEW artwork starts in the first one
  useEffect(() => {
    let current = true;
    adminApi
      .get<{ categories: AdminCategory[] }>('/categories')
      .then((r) => {
        if (!current) return;
        setCategories(r.categories);
        if (!artwork && r.categories[0]) {
          setForm((f) => (f.category_id ? f : { ...f, category_id: r.categories[0]!.id }));
          setSaved((f) => (f.category_id ? f : { ...f, category_id: r.categories[0]!.id }));
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [artwork]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const year = parseNumber(form.year);
    const width = parseNumber(form.width_cm);
    const height = parseNumber(form.height_cm);
    const depth = parseNumber(form.depth_cm);
    const price = parseNumber(form.price);
    if (!form.title.trim()) next.title = 'The English title is required.';
    if (!form.category_id) next.category_id = 'Choose a category.';
    if (!form.size_class) next.size_class = 'Choose Small, Medium or Large.';
    if (year === 'invalid' || (typeof year === 'number' && !Number.isInteger(year))) next.year = 'Enter a year such as 2025.';
    for (const [key, v] of [['width_cm', width], ['height_cm', height], ['depth_cm', depth]] as const) {
      if (v === 'invalid' || (typeof v === 'number' && v <= 0)) next[key] = 'Enter a number larger than 0, or leave it empty.';
    }
    if (price === 'invalid' || (typeof price === 'number' && price < 0)) next.price = 'Enter an amount such as 12000, or leave it empty for no price.';
    setErrors(next);
    if (Object.keys(next).length) {
      setMessage({ kind: 'error', text: 'Please fix the highlighted fields.' });
      return;
    }

    setSaving(true);
    const body = {
      title: form.title,
      title_da: form.title_da,
      description: form.description,
      description_da: form.description_da,
      medium: form.medium,
      medium_da: form.medium_da,
      year: year as number | null,
      width_cm: width as number | null,
      height_cm: height as number | null,
      depth_cm: depth as number | null,
      // empty price field = NULL (no price), never 0
      price_minor: price === null ? null : Math.round((price as number) * 100),
      currency: price === null ? null : form.currency,
      status: form.status,
      featured: form.featured,
      category_id: form.category_id,
      size_class: form.size_class,
    };
    try {
      const result = artwork
        ? await adminApi.put<AdminArtwork>(`/artworks/${artwork.id}`, body)
        : await adminApi.post<AdminArtwork>('/artworks', body);
      setSaved(form);
      setErrors({});
      setMessage({ kind: 'success', text: artwork ? 'Saved. The public site updates in a few minutes.' : 'Created.' });
      announceContentSaved();
      onSaved(result, !artwork);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrors(err.fields);
        setMessage({ kind: 'error', text: err.message });
      } else throw err;
    } finally {
      setSaving(false);
    }
  }

  const text = (id: keyof FormState & string, extra: Record<string, unknown> = {}) => ({
    id,
    className: 'field',
    value: form[id] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(id, e.target.value as never),
    'aria-invalid': Boolean(errors[id]),
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
    ...extra,
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-10">
      <section aria-labelledby="text-heading" className="space-y-6">
        <h2 id="text-heading" className="text-xl">
          Text
        </h2>
        <p className="text-sm text-stone">English is required. Danish is optional: if you leave it empty, Danish visitors see the English text.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="title" label="Title (English)" error={errors.title}>
            <input {...text('title', { maxLength: LIMITS.titleMax })} />
          </Field>
          <Field id="title_da" label="Title (Danish, optional)" error={errors.title_da}>
            <input {...text('title_da', { maxLength: LIMITS.titleMax })} lang="da" />
          </Field>
          <Field id="description" label="Description (English)" hint={`Leave a blank line between paragraphs. ${charCount(form.description, LIMITS.descriptionMax)}`} error={errors.description}>
            <textarea {...text('description', { rows: 8, maxLength: LIMITS.descriptionMax })} />
          </Field>
          <Field id="description_da" label="Description (Danish, optional)" hint={charCount(form.description_da, LIMITS.descriptionMax)} error={errors.description_da}>
            <textarea {...text('description_da', { rows: 8, maxLength: LIMITS.descriptionMax })} lang="da" />
          </Field>
          <Field id="medium" label="Materials and technique (English)" hint="For example: Oil on canvas" error={errors.medium}>
            <input {...text('medium', { maxLength: LIMITS.mediumMax })} />
          </Field>
          <Field id="medium_da" label="Materials and technique (Danish, optional)" hint="For example: Olie på lærred" error={errors.medium_da}>
            <input {...text('medium_da', { maxLength: LIMITS.mediumMax })} lang="da" />
          </Field>
        </div>
      </section>

      <section aria-labelledby="facts-heading" className="space-y-6">
        <h2 id="facts-heading" className="text-xl">
          Details
        </h2>
        <p className="text-sm text-stone">The public page only shows the details you fill in.</p>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <Field id="year" label="Year" error={errors.year}>
            <input {...text('year', { inputMode: 'numeric' })} />
          </Field>
          <Field id="width_cm" label="Width (cm)" error={errors.width_cm}>
            <input {...text('width_cm', { inputMode: 'decimal' })} />
          </Field>
          <Field id="height_cm" label="Height (cm)" error={errors.height_cm}>
            <input {...text('height_cm', { inputMode: 'decimal' })} />
          </Field>
          <Field id="depth_cm" label="Depth (cm)" error={errors.depth_cm}>
            <input {...text('depth_cm', { inputMode: 'decimal' })} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field
              id="price"
              label="Price (optional)"
              hint="Leave empty to show no price at all: nothing is displayed, not even a dash. Enter 0 only if the work is truly free."
              error={errors.price}
            >
              <input {...text('price', { inputMode: 'decimal', placeholder: 'No price' })} />
            </Field>
          </div>
          <Field id="currency" label="Currency" hint="Only used when there is a price.">
            <select {...text('currency')}>
              <option value="DKK">DKK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>
      </section>

      <section aria-labelledby="where-heading" className="space-y-6">
        <h2 id="where-heading" className="text-xl">
          Category and size
        </h2>
        <p className="text-sm text-stone">Visitors can filter the gallery by both, so please choose them for every artwork.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field
            id="category_id"
            label="Category"
            error={errors.category_id}
            hint={categories && categories.length === 0 ? 'There are no categories yet. Add one first.' : undefined}
          >
            <select {...text('category_id')} disabled={!categories || categories.length === 0}>
              {categories?.length ? null : <option value="">No categories</option>}
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="size_class"
            label="Size"
            error={errors.size_class}
            hint="Small, Medium or Large. It does not have to match the centimetres exactly: choose what feels right."
          >
            <select {...text('size_class')}>
              <option value="">Choose a size</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </Field>
        </div>
        <p className="text-sm">
          <Link href="/admin/categories" className="link">
            Add, rename or delete categories
          </Link>
        </p>
      </section>

      <section aria-labelledby="status-heading" className="space-y-4">
        <h2 id="status-heading" className="text-xl">
          Visibility
        </h2>
        <Field id="status" label="Status" hint={STATUS_OPTIONS.find((o) => o.value === form.status)?.help}>
          <select {...text('status')} className="field max-w-xs">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="h-5 w-5" />
          <span>Featured: show on the home page</span>
        </label>
      </section>

      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <div className="flex items-center gap-4">
        {/* wait for the category list, so a quick click can never submit "no category" */}
        <button type="submit" className="btn btn-primary" disabled={saving || categories === null}>
          {saving ? 'Saving...' : artwork ? 'Save changes' : 'Create artwork'}
        </button>
        {dirty ? <span className="text-sm text-stone">Unsaved changes</span> : null}
      </div>
    </form>
  );
}
