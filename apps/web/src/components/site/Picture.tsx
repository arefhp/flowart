import { buildSrcSet, variantUrl } from '@flowart/shared';
import type { PublicImage } from '@/lib/types';

/**
 * One artwork image from the pre-generated WebP variants (480 / 960 / 1920 wide).
 * Width and height reserve the space, so nothing jumps while it loads.
 */
export function Picture({
  image,
  sizes,
  priority = false,
  className = '',
  fit = 'natural',
}: {
  image: PublicImage;
  sizes: string;
  priority?: boolean;
  className?: string;
  /**
   * natural: full width, the image's own proportions (gallery).
   * cover: fills a fixed box (the About portrait).
   * height: sized by a maximum height and shrinks to its own width (the home hero), so no grey side bars.
   */
  fit?: 'natural' | 'cover' | 'height';
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variantUrl(image.url, 960)}
      srcSet={buildSrcSet(image.url)}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={`block bg-hairline ${
        fit === 'cover' ? 'h-full w-full object-cover' : fit === 'height' ? 'h-auto max-w-full' : 'h-auto w-full'
      } ${className}`}
    />
  );
}
