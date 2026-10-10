'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminApiError, adminApi, type AdminArtwork, type AdminArtworkRow } from '@/lib/admin-api';
import { variantUrl } from '@flowart/shared';
import { announceContentSaved } from './AdminShell';
import { ArtworkForm } from './ArtworkForm';
import { ImageManager } from './ImageManager';
import { Notice, PageTitle } from './ui';

const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' } as const;
const STATUS_LABEL = { available: 'Available', reserved: 'Reserved', sold: 'Sold', hidden: 'Hidden' } as const;

function priceText(minor: number | null, currency: string | null) {
  if (minor === null || !currency) return 'No price';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function ArtworksAdmin() {
  const [rows, setRows] = useState<AdminArtworkRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .get<{ artworks: AdminArtworkRow[] }>('/artworks')
      .then((r) => setRows(r.artworks))
      .catch((e: unknown) => setError(e instanceof AdminApiError ? e.message : 'Could not load the artworks.'));
  }, []);

  return (
    <div>
      <PageTitle
        aside={
          <Link href="/admin/artworks/new" className="btn btn-primary">
            New artwork
          </Link>
        }
      >
        Artworks
      </PageTitle>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {rows === null && !error ? <p className="text-stone">Loading...</p> : null}
      {rows && rows.length === 0 ? (
        <Notice kind="info">No artworks yet. Add your first one with "New artwork".</Notice>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <caption className="sr-only">All artworks</caption>
            <thead className="border-b border-ink text-sm">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Artwork
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Size
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Price
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Images
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-hairline">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/artworks/edit?id=${a.id}`} className="flex items-center gap-4">
                      {a.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={variantUrl(a.cover.url, 480)} alt="" width={a.cover.width} height={a.cover.height} className="h-16 w-12 bg-hairline object-cover" />
                      ) : (
                        <span className="grid h-16 w-12 place-items-center border border-dashed border-[#aeb2ab] text-xs text-stone">none</span>
                      )}
                      <span>
                        <span className="link font-serif text-lg">{a.title}</span>
                        {a.featured ? <span className="block text-sm text-stone">Featured</span> : null}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{a.category_name ?? 'None'}</td>
                  <td className="py-3 pr-4">{a.size_class ? SIZE_LABEL[a.size_class] : 'Not set'}</td>
                  <td className="py-3 pr-4">{STATUS_LABEL[a.status]}</td>
                  <td className="py-3 pr-4">{priceText(a.price_minor, a.currency)}</td>
                  <td className="py-3 pr-4">
                    {a.image_count}
                    {a.image_count === 0 ? <span className="block text-sm text-alert">Not shown publicly</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function NewArtwork() {
  const router = useRouter();
  return (
    <div>
      <PageTitle>New artwork</PageTitle>
      <p className="mb-8 max-w-2xl text-stone">Fill in the details, then add images on the next screen.</p>
      <ArtworkForm artwork={null} onSaved={(saved) => router.push(`/admin/artworks/edit?id=${saved.id}&created=1`)} />
    </div>
  );
}

export function EditArtwork() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const created = params.get('created') === '1';
  const [artwork, setArtwork] = useState<AdminArtwork | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No artwork selected.');
      return;
    }
    adminApi
      .get<AdminArtwork>(`/artworks/${id}`)
      .then(setArtwork)
      .catch((e: unknown) => setError(e instanceof AdminApiError && e.status === 404 ? 'This artwork no longer exists.' : 'Could not load the artwork.'));
  }, [id]);

  async function remove() {
    if (!artwork) return;
    const ok = window.confirm(
      `Delete "${artwork.title}"? This also deletes its stored images and cannot be undone. Keep your original files.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.delete(`/artworks/${artwork.id}`);
      announceContentSaved();
      router.push('/admin/artworks');
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not delete the artwork.');
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div>
        <Notice kind="error">{error}</Notice>
        <p className="mt-4">
          <Link href="/admin/artworks" className="link">
            Back to artworks
          </Link>
        </p>
      </div>
    );
  }
  if (!artwork) return <p className="text-stone">Loading...</p>;

  return (
    <div className="space-y-12">
      <div>
        <p className="mb-2 text-sm">
          <Link href="/admin/artworks" className="link text-stone">
            Artworks
          </Link>
        </p>
        <PageTitle>{artwork.title}</PageTitle>
        {created ? <Notice kind="success">Created. Now add images below: an artwork without images is not shown publicly.</Notice> : null}
      </div>
      <ArtworkForm artwork={artwork} onSaved={(saved) => setArtwork((a) => (a ? { ...a, ...saved, images: a.images } : saved))} />
      <ImageManager artwork={artwork} onChange={setArtwork} />
      <section aria-labelledby="danger-heading" className="border-t border-hairline pt-8">
        <h2 id="danger-heading" className="mb-2 text-xl">
          Delete this artwork
        </h2>
        <p className="mb-4 max-w-xl text-stone">
          This removes the artwork and its images for good. To take it off the public site without deleting it, set the status to Hidden instead.
        </p>
        <button type="button" className="btn text-alert" onClick={remove} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete artwork'}
        </button>
      </section>
    </div>
  );
}
