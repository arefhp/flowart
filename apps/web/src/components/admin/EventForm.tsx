'use client';

import { DEFAULT_TIMEZONE } from '@flowart/shared';
import { useState } from 'react';
import { AdminApiError, adminApi, type AdminEvent } from '@/lib/admin-api';
import { announceContentSaved } from './AdminShell';
import { Field, Notice, charCount, useUnsavedWarning } from './ui';

interface FormState {
  title: string;
  title_da: string;
  description: string;
  description_da: string;
  location: string;
  location_da: string;
  starts_local: string;
  ends_local: string;
  max_participants: string;
  price: string;
  currency: string;
}

const toMajor = (minor: number) => String(minor / 100);

function initial(e: AdminEvent | null): FormState {
  return {
    title: e?.title ?? '',
    title_da: e?.title_da ?? '',
    description: e?.description ?? '',
    description_da: e?.description_da ?? '',
    location: e?.location ?? '',
    location_da: e?.location_da ?? '',
    starts_local: e?.starts_local ?? '',
    ends_local: e?.ends_local ?? '',
    max_participants: e ? String(e.max_participants) : '8',
    price: e ? toMajor(e.price_minor) : '',
    currency: e?.currency ?? 'DKK',
  };
}

/**
 * Create or edit a workshop. Times are typed in the event's own time zone (Copenhagen): the site
 * converts them, including summer and winter time. A new event is saved as a DRAFT; publishing is
 * a separate, deliberate step.
 */
export function EventForm({ event, onSaved }: { event: AdminEvent | null; onSaved: (saved: AdminEvent, created: boolean) => void }) {
  const [form, setForm] = useState<FormState>(() => initial(event));
  const [saved, setSaved] = useState<FormState>(() => initial(event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const editable = !event || event.status === 'draft' || event.status === 'published';
  const timezone = event?.timezone ?? DEFAULT_TIMEZONE;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const places = Number(form.max_participants);
    const price = Number(form.price.trim().replace(',', '.'));
    if (!form.title.trim()) next.title = 'The English title is required.';
    if (!form.starts_local) next.starts_local = 'Choose the start date and time.';
    if (!form.ends_local) next.ends_local = 'Choose the end date and time.';
    if (form.starts_local && form.ends_local && form.ends_local <= form.starts_local) next.ends_local = 'The end must be after the start.';
    if (!Number.isInteger(places) || places < 1) next.max_participants = 'Enter a whole number of places, at least 1.';
    if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) next.price = 'Enter the price per person (0 for a free workshop).';
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
      location: form.location,
      location_da: form.location_da,
      starts_local: form.starts_local,
      ends_local: form.ends_local,
      timezone,
      max_participants: places,
      price_minor: Math.round(price * 100),
      currency: form.currency,
    };
    try {
      const result = event ? await adminApi.put<AdminEvent>(`/events/${event.id}`, body) : await adminApi.post<AdminEvent>('/events', body);
      setSaved(form);
      setErrors({});
      setMessage({ kind: 'success', text: event ? 'Saved.' : 'Saved as a draft.' });
      announceContentSaved();
      onSaved(result, !event);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setErrors(err.fields);
        setMessage({ kind: 'error', text: err.message });
      } else throw err;
    } finally {
      setSaving(false);
    }
  }

  const input = (id: keyof FormState & string, extra: Record<string, unknown> = {}) => ({
    id,
    className: 'field',
    value: form[id],
    disabled: !editable,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(id, e.target.value as never),
    'aria-invalid': Boolean(errors[id]),
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
    ...extra,
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-10">
      <section aria-labelledby="ev-when" className="space-y-6">
        <h2 id="ev-when" className="text-xl">
          When and where
        </h2>
        <p className="text-sm text-stone">
          Type the time as it is on the clock in Copenhagen. Summer and winter time are handled for you. ({timezone})
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="starts_local" label="Starts" error={errors.starts_local}>
            <input type="datetime-local" step={300} {...input('starts_local')} />
          </Field>
          <Field id="ends_local" label="Ends" error={errors.ends_local}>
            <input type="datetime-local" step={300} {...input('ends_local')} />
          </Field>
          <Field id="location" label="Location (English)" hint="For example: The studio, Copenhagen" error={errors.location}>
            <input {...input('location', { maxLength: 200 })} />
          </Field>
          <Field id="location_da" label="Location (Danish, optional)" error={errors.location_da}>
            <input lang="da" {...input('location_da', { maxLength: 200 })} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="ev-places" className="space-y-6">
        <h2 id="ev-places" className="text-xl">
          Places and price
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <Field id="max_participants" label="Number of places" error={errors.max_participants}>
            <input inputMode="numeric" {...input('max_participants')} />
          </Field>
          <Field id="price" label="Price per person" hint="Enter 0 for a free workshop." error={errors.price}>
            <input inputMode="decimal" {...input('price')} />
          </Field>
          <Field id="currency" label="Currency">
            <select {...input('currency')}>
              <option value="DKK">DKK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>
      </section>

      <section aria-labelledby="ev-text" className="space-y-6">
        <h2 id="ev-text" className="text-xl">
          What visitors read
        </h2>
        <p className="text-sm text-stone">
          Tell people what to expect: what they will paint, whether beginners are welcome, what is included (paint, canvas, brushes, snacks) and the atmosphere you want.
          English is required; Danish is optional and falls back to English.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="title" label="Title (English)" error={errors.title}>
            <input {...input('title', { maxLength: 200 })} />
          </Field>
          <Field id="title_da" label="Title (Danish, optional)" error={errors.title_da}>
            <input lang="da" {...input('title_da', { maxLength: 200 })} />
          </Field>
          <Field id="description" label="Description (English)" hint={`Leave a blank line between paragraphs. ${charCount(form.description, 5000)}`} error={errors.description}>
            <textarea rows={9} {...input('description', { maxLength: 5000 })} />
          </Field>
          <Field id="description_da" label="Description (Danish, optional)" hint={charCount(form.description_da, 5000)} error={errors.description_da}>
            <textarea rows={9} lang="da" {...input('description_da', { maxLength: 5000 })} />
          </Field>
        </div>
      </section>

      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      {editable ? (
        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : event ? 'Save changes' : 'Save as draft'}
          </button>
          {dirty ? <span className="text-sm text-stone">Unsaved changes</span> : null}
        </div>
      ) : (
        <Notice kind="info">A {event?.status} event can no longer be edited.</Notice>
      )}
    </form>
  );
}
