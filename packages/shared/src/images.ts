import { IMAGE_WIDTHS } from './constants';

/** URL of one variant, given the base URL (no suffix) the API returns. */
export function variantUrl(base: string, width: number): string {
  return `${base}-${width}.webp`;
}

/** `srcset` string over the pre-generated variants. */
export function buildSrcSet(base: string, widths: readonly number[] = IMAGE_WIDTHS): string {
  return widths.map((w) => `${variantUrl(base, w)} ${w}w`).join(', ');
}

/**
 * Read the pixel size of a WebP file (VP8, VP8L or VP8X). Returns null when the
 * bytes are not a valid WebP. Used by the Worker to verify uploads: it never
 * trusts what the browser says about an image.
 */
export function parseWebpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...bytes.subarray(start, start + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  const riffSize = bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
  // RIFF size counts everything after the first 8 bytes; it must not exceed the file.
  if (riffSize + 8 > bytes.length + 1) return null;
  const chunk = ascii(12, 4);
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = (bytes[26]! | (bytes[27]! << 8)) & 0x3fff;
    const height = (bytes[28]! | (bytes[29]! << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null;
    const b1 = bytes[21]!;
    const b2 = bytes[22]!;
    const b3 = bytes[23]!;
    const b4 = bytes[24]!;
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunk === 'VP8X') {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { width, height };
  }
  return null;
}
