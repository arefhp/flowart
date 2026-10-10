'use client';

import { variantUrl } from '@flowart/shared';
import { useEffect, useRef, useState } from 'react';
import { AdminApiError, adminApi, type AdminArtwork, type AdminImage } from '@/lib/admin-api';
import { ACCEPT_ATTR, ImagePrepError, prepareImage, uploadFormData } from '@/lib/image-resize';
import { announceContentSaved } from './AdminShell';
import { Notice } from './ui';

interface Queued {
  key: string;
  file: File;
  preview: string;
  alt: string;
  altDa: string;
  state: 'ready' | 'working' | 'error';
  error?: string;
}

/**
 * Images of one artwork: add several at once (the browser prepares the three sizes), choose the
 * cover, reorder, write alt text in both languages, delete.
 */
export function ImageManager({ artwork, onChange }: { artwork: AdminArtwork; onChange: (a: AdminArtwork) => void }) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // free preview URLs when the queue changes or the component goes away
  useEffect(() => () => queue.forEach((q) => URL.revokeObjectURL(q.preview)), [queue]);

  function addFiles(files: FileList | File[]) {
    const items = Array.from(files).map<Queued>((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      preview: URL.createObjectURL(file),
      alt: '',
      altDa: '',
      state: 'ready',
    }));
    setQueue((q) => [...q, ...items]);
  }

  const update = (key: string, patch: Partial<Queued>) =>
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function uploadAll() {
    setBusy(true);
    setNotice(null);
    let current = artwork;
    let done = 0;
    for (const item of queue) {
      update(item.key, { state: 'working', error: undefined });
      try {
        const prepared = await prepareImage(item.file);
        const form = uploadFormData(prepared, { alt_text: item.alt, alt_text_da: item.altDa });
        current = await adminApi.upload<AdminArtwork>(`/artworks/${artwork.id}/images`, form);
        onChange(current);
        done++;
        setQueue((q) => q.filter((x) => x.key !== item.key));
      } catch (err) {
        const text = err instanceof ImagePrepError || err instanceof AdminApiError ? err.message : 'The upload failed.';
        update(item.key, { state: 'error', error: text });
      }
    }
    setBusy(false);
    if (done) {
      announceContentSaved();
      setNotice({ kind: 'success', text: `${done} image${done === 1 ? '' : 's'} added. The public site updates in a few minutes.` });
    }
  }

  async function run(action: () => Promise<AdminArtwork>, success?: string) {
    setNotice(null);
    try {
      const updated = await action();
      onChange(updated);
      announceContentSaved();
      if (success) setNotice({ kind: 'success', text: success });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof AdminApiError ? err.message : 'Something went wrong.' });
    }
  }

  const images = artwork.images;
  const move = (index: number, delta: number) => {
    const ids = images.map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => adminApi.patch<AdminArtwork>(`/artworks/${artwork.id}/images/order`, { ids }));
  };

  return (
    <section aria-labelledby="images-heading" className="space-y-6">
      <h2 id="images-heading" className="text-xl">
        Images
      </h2>
      <p className="text-sm text-stone">
        The gallery shows only the <strong>cover</strong>. Visitors who click the artwork see all the images here. Add several at once; your browser prepares the
        web sizes, so choose your original photo (JPEG, PNG or WebP).
      </p>

      {images.length === 0 ? <Notice kind="info">This artwork has no images yet, so it is not shown publicly. Add one below.</Notice> : null}

      <ul className="space-y-4">
        {images.map((img, i) => (
          <ImageRow
            key={img.id}
            image={img}
            index={i}
            total={images.length}
            onCover={() => run(() => adminApi.put<AdminArtwork>(`/artworks/${artwork.id}/cover`, { imageId: img.id }), 'Cover changed.')}
            onMove={(d) => move(i, d)}
            onSaveAlt={(alt_text, alt_text_da) =>
              run(() => adminApi.patch<AdminArtwork>(`/artworks/${artwork.id}/images/${img.id}`, { alt_text, alt_text_da }), 'Alt text saved.')
            }
            onDelete={() => {
              if (window.confirm('Delete this image? This cannot be undone. Keep your original photo on your own computer.')) {
                void run(() => adminApi.delete<AdminArtwork>(`/artworks/${artwork.id}/images/${img.id}`), 'Image deleted.');
              }
            }}
          />
        ))}
      </ul>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={`border border-dashed p-6 text-center ${dragging ? 'border-lapis bg-paper' : 'border-[#aeb2ab]'}`}
      >
        <p className="mb-3">Drag photos here, or</p>
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          Choose photos
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="sr-only"
          aria-label="Choose photos to add"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {queue.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg">Ready to add</h3>
          <ul className="space-y-4">
            {queue.map((item) => (
              <li key={item.key} className="grid gap-4 border border-hairline bg-paper p-4 sm:grid-cols-[6rem_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="h-28 w-24 object-cover" />
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm" htmlFor={`alt-${item.key}`}>
                      Alt text (English)
                    </label>
                    <input id={`alt-${item.key}`} className="field" value={item.alt} maxLength={300} placeholder="Describe the painting in one sentence" onChange={(e) => update(item.key, { alt: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm" htmlFor={`altda-${item.key}`}>
                      Alt text (Danish, optional)
                    </label>
                    <input id={`altda-${item.key}`} lang="da" className="field" value={item.altDa} maxLength={300} onChange={(e) => update(item.key, { altDa: e.target.value })} />
                  </div>
                  <p className="text-sm text-stone md:col-span-2">
                    {item.file.name}
                    {item.state === 'working' ? ' - uploading...' : ''}
                  </p>
                  {item.error ? (
                    <p role="alert" className="text-sm text-alert md:col-span-2">
                      {item.error}
                    </p>
                  ) : null}
                  <button type="button" className="btn w-fit" disabled={busy} onClick={() => setQueue((q) => q.filter((x) => x.key !== item.key))}>
                    Remove from list
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={uploadAll}>
            {busy ? 'Uploading...' : `Add ${queue.length} image${queue.length === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : null}

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
    </section>
  );
}

function ImageRow({
  image,
  index,
  total,
  onCover,
  onMove,
  onSaveAlt,
  onDelete,
}: {
  image: AdminImage;
  index: number;
  total: number;
  onCover: () => void;
  onMove: (delta: number) => void;
  onSaveAlt: (alt: string, altDa: string) => void;
  onDelete: () => void;
}) {
  const [alt, setAlt] = useState(image.alt_text);
  const [altDa, setAltDa] = useState(image.alt_text_da ?? '');
  const changed = alt !== image.alt_text || altDa !== (image.alt_text_da ?? '');
  return (
    <li className="grid gap-4 border border-hairline bg-paper p-4 sm:grid-cols-[6rem_1fr]">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={variantUrl(image.url, 480)} alt={image.alt_text} width={image.width} height={image.height} className="h-28 w-24 bg-hairline object-cover" />
        {image.is_cover ? <p className="mt-1 text-sm font-medium text-lapis">Cover</p> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm" htmlFor={`a-${image.id}`}>
            Alt text (English)
          </label>
          <input id={`a-${image.id}`} className="field" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm" htmlFor={`ad-${image.id}`}>
            Alt text (Danish, optional)
          </label>
          <input id={`ad-${image.id}`} lang="da" className="field" value={altDa} maxLength={300} onChange={(e) => setAltDa(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="button" className="btn" onClick={() => onSaveAlt(alt, altDa)} disabled={!changed}>
            Save text
          </button>
          {image.is_cover ? null : (
            <button type="button" className="btn" onClick={onCover}>
              Set as cover
            </button>
          )}
          <button type="button" className="btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move image ${index + 1} up`}>
            Move up
          </button>
          <button type="button" className="btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move image ${index + 1} down`}>
            Move down
          </button>
          <button type="button" className="btn text-alert" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
