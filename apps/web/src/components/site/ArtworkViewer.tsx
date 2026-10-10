'use client';

import { buildSrcSet, variantUrl } from '@flowart/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, type Dict } from '@/i18n/dictionary';
import type { PublicImage } from '@/lib/types';

/**
 * Artwork images: the cover large, a thumbnail strip when there are several, and a full-screen
 * viewer (a native modal dialog: focus is trapped, Esc closes). Arrow keys and buttons move
 * between images, swipe works on touch, neighbours are preloaded.
 */
/** Only the viewer's own strings are passed in (not the whole dictionary), so nothing unrelated is shipped with the page. */
export type ViewerStrings = Pick<Dict['artwork'], 'viewLarge' | 'imagesLabel' | 'imageOf' | 'close' | 'prev' | 'next'>;

export function ArtworkViewer({ images, title, t }: { images: PublicImage[]; title: string; t: ViewerStrings }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const swipeStart = useRef<number | null>(null);
  const many = images.length > 1;
  const current = images[index]!;

  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + images.length) % images.length),
    [images.length],
  );

  // open / close the native dialog and keep the page from scrolling behind it
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // preload the neighbours so moving between images feels instant
  useEffect(() => {
    if (!open || !many) return;
    for (const d of [-1, 1]) {
      const n = images[(index + d + images.length) % images.length]!;
      const img = new Image();
      img.srcset = buildSrcSet(n.url);
      img.src = variantUrl(n.url, 1920);
    }
  }, [open, index, images, many]);

  function openAt(i: number, el: HTMLElement) {
    openerRef.current = el;
    setIndex(i);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    openerRef.current?.focus();
  }

  return (
    <div>
      <button
        type="button"
        onClick={(e) => openAt(index, e.currentTarget)}
        aria-label={fmt(t.viewLarge, { n: index + 1 })}
        className="block w-full cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={variantUrl(current.url, 960)}
          srcSet={buildSrcSet(current.url)}
          sizes="(min-width: 1024px) 56vw, 92vw"
          width={current.width}
          height={current.height}
          alt={current.alt}
          fetchPriority="high"
          decoding="async"
          className="block h-auto w-full bg-hairline"
        />
      </button>

      {many ? (
        <ul aria-label={fmt(t.imagesLabel, { title })} className="mt-4 flex flex-wrap gap-3">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={fmt(t.imageOf, { n: i + 1, total: images.length })}
                aria-current={i === index ? 'true' : undefined}
                className={`block h-20 w-16 overflow-hidden border ${i === index ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={variantUrl(img.url, 480)}
                  alt=""
                  width={img.width}
                  height={img.height}
                  loading="lazy"
                  className="h-full w-full bg-hairline object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-label={title}
        onClose={() => {
          setOpen(false);
          document.body.style.overflow = '';
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === 'ArrowLeft') go(-1);
          if (e.key === 'ArrowRight') go(1);
        }}
        className="m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-ink/90"
      >
        {open ? (
          <div
            className="relative flex h-full w-full items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            onPointerDown={(e) => {
              swipeStart.current = e.clientX;
            }}
            onPointerUp={(e) => {
              if (swipeStart.current === null || !many) return;
              const dx = e.clientX - swipeStart.current;
              swipeStart.current = null;
              if (Math.abs(dx) > 60) go(dx > 0 ? -1 : 1);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={variantUrl(current.url, 1920)}
              srcSet={buildSrcSet(current.url)}
              sizes="100vw"
              alt={current.alt}
              decoding="async"
              draggable={false}
              className="max-h-[92vh] max-w-[94vw] select-none object-contain"
            />
            <button
              type="button"
              onClick={close}
              className="absolute right-3 top-3 min-h-[44px] min-w-[44px] bg-paper/90 px-4 text-ink hover:bg-paper"
            >
              {t.close}
            </button>
            {many ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={t.prev}
                  className="absolute left-3 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 bg-paper/90 text-xl text-ink hover:bg-paper"
                >
                  <span aria-hidden="true">&lsaquo;</span>
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={t.next}
                  className="absolute right-3 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 bg-paper/90 text-xl text-ink hover:bg-paper"
                >
                  <span aria-hidden="true">&rsaquo;</span>
                </button>
                <p aria-live="polite" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-paper/90 px-3 py-1 text-sm text-ink">
                  {fmt(t.imageOf, { n: index + 1, total: images.length })}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
