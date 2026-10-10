'use client';

import { LIMITS } from '@flowart/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi, type AdminCategory } from '@/lib/admin-api';
import { announceContentSaved } from './AdminShell';
import { Field, Notice, PageTitle } from './ui';

/**
 * Categories for the gallery (Fine Art, Resin, ...). The owner adds, renames, reorders and deletes
 * them here, and picks one for every artwork. A category that still has artworks cannot be
 * deleted: the owner is told which artworks to move first.
 */
export function CategoriesAdmin() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, { message: string; titles?: string[] }>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let current = true;
    adminApi
      .get<{ categories: AdminCategory[] }>('/categories')
      .then((r) => {
        if (current) setCategories(r.categories);
      })
      .catch((e: unknown) => {
        if (current) setLoadError(e instanceof AdminApiError ? e.message : 'Could not load the categories.');
      });
    return () => {
      current = false;
    };
  }, []);

  const saved = (text: string) => {
    setNotice({ kind: 'success', text });
    announceContentSaved();
  };

  async function move(index: number, delta: number) {
    if (!categories) return;
    const ids = categories.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      const r = await adminApi.patch<{ categories: AdminCategory[] }>('/categories/order', { ids });
      setCategories(r.categories);
      saved('Order saved. This is the order of the filter buttons on the site.');
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Could not change the order.' });
    }
  }

  async function remove(category: AdminCategory) {
    if (!window.confirm(`Delete the category "${category.name}"?`)) return;
    setNotice(null);
    try {
      await adminApi.delete(`/categories/${category.id}`);
      setCategories((list) => list?.filter((c) => c.id !== category.id) ?? list);
      setRowErrors((e) => {
        const { [category.id]: _gone, ...rest } = e;
        return rest;
      });
      saved(`Deleted "${category.name}".`);
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'category_in_use') {
        setRowErrors((errs) => ({ ...errs, [category.id]: { message: e.message, titles: e.details?.titles as string[] | undefined } }));
      } else {
        setNotice({ kind: 'error', text: e instanceof AdminApiError ? e.message : 'Could not delete the category.' });
      }
    }
  }

  if (loadError) return <Notice kind="error">{loadError}</Notice>;
  if (!categories) return <p className="text-stone">Loading...</p>;

  return (
    <div className="space-y-10">
      <PageTitle>Categories</PageTitle>
      <p className="max-w-2xl text-stone">
        Categories group your artworks. You choose one for each artwork, and visitors can filter the gallery by category. The order here is the order of the buttons on the
        site. A category can only be deleted when no artwork is in it.
      </p>

      <AddCategory
        onAdded={(c) => {
          setCategories((list) => [...(list ?? []), c]);
          saved(`Added "${c.name}".`);
        }}
      />

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {categories.length === 0 ? <Notice kind="info">No categories yet. Add your first one above.</Notice> : null}

      <ul className="space-y-4">
        {categories.map((c, i) => (
          <CategoryRow
            key={c.id}
            category={c}
            index={i}
            total={categories.length}
            error={rowErrors[c.id]}
            onMove={(d) => move(i, d)}
            onDelete={() => remove(c)}
            onSaved={(updated) => {
              setCategories((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? list);
              setRowErrors((e) => {
                const { [updated.id]: _gone, ...rest } = e;
                return rest;
              });
              saved(`Saved "${updated.name}".`);
            }}
          />
        ))}
      </ul>
      <p className="text-sm">
        <Link href="/admin/artworks" className="link">
          Back to artworks
        </Link>
      </p>
    </div>
  );
}

function AddCategory({ onAdded }: { onAdded: (c: AdminCategory) => void }) {
  const [name, setName] = useState('');
  const [nameDa, setNameDa] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Enter a name for the new category.');
      return;
    }
    setBusy(true);
    try {
      const created = await adminApi.post<AdminCategory>('/categories', { name, name_da: nameDa });
      setName('');
      setNameDa('');
      onAdded(created);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Could not add the category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} noValidate aria-labelledby="add-heading" className="border border-hairline bg-paper p-5">
      <h2 id="add-heading" className="mb-4 text-xl">
        Add a category
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field id="new-name" label="Name (English)">
          <input id="new-name" className="field" value={name} maxLength={LIMITS.categoryNameMax} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="new-name-da" label="Name (Danish, optional)">
          <input id="new-name-da" lang="da" className="field" value={nameDa} maxLength={LIMITS.categoryNameMax} onChange={(e) => setNameDa(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Adding...' : 'Add category'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function CategoryRow({
  category,
  index,
  total,
  error,
  onMove,
  onDelete,
  onSaved,
}: {
  category: AdminCategory;
  index: number;
  total: number;
  error?: { message: string; titles?: string[] };
  onMove: (delta: number) => void;
  onDelete: () => void;
  onSaved: (c: AdminCategory) => void;
}) {
  const [name, setName] = useState(category.name);
  const [nameDa, setNameDa] = useState(category.name_da ?? '');
  const [saveError, setSaveError] = useState('');
  const changed = name !== category.name || nameDa !== (category.name_da ?? '');

  async function save() {
    setSaveError('');
    try {
      onSaved(await adminApi.put<AdminCategory>(`/categories/${category.id}`, { name, name_da: nameDa }));
    } catch (e) {
      setSaveError(e instanceof AdminApiError ? e.message : 'Could not save.');
    }
  }

  return (
    <li className="border border-hairline bg-paper p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`n-${category.id}`} label="Name (English)">
          <input id={`n-${category.id}`} className="field" value={name} maxLength={LIMITS.categoryNameMax} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id={`d-${category.id}`} label="Name (Danish, optional)">
          <input id={`d-${category.id}`} lang="da" className="field" value={nameDa} maxLength={LIMITS.categoryNameMax} onChange={(e) => setNameDa(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-sm text-stone">
        {category.artwork_count === 0
          ? 'No artworks in this category.'
          : `${category.artwork_count} artwork${category.artwork_count === 1 ? '' : 's'} in this category.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={save} disabled={!changed || !name.trim()}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${category.name} up`}>
          Move up
        </button>
        <button type="button" className="btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move ${category.name} down`}>
          Move down
        </button>
        <button type="button" className="btn text-alert" onClick={onDelete} aria-label={`Delete ${category.name}`}>
          Delete
        </button>
      </div>
      {saveError ? (
        <p role="alert" className="mt-3 text-alert">
          {saveError}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 border-l-4 border-alert bg-wall px-4 py-3 text-alert">
          <p>{error.message}</p>
          {error.titles?.length ? <p className="mt-1">In this category: {error.titles.join(', ')}.</p> : null}
          <p className="mt-1">
            <Link className="link" href="/admin/artworks">
              Go to the artworks to move them
            </Link>
          </p>
        </div>
      ) : null}
    </li>
  );
}
