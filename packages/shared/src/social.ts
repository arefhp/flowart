import { LIMITS, type SocialPlatform } from './constants';

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  x: 'X',
  behance: 'Behance',
  other: 'Link',
};

export function platformLabel(platform: SocialPlatform): string {
  return PLATFORM_LABELS[platform];
}

/** Hostnames that belong to each platform (`www.` / `m.` variants are accepted automatically). */
const PLATFORM_HOSTS: Record<Exclude<SocialPlatform, 'other'>, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  pinterest: ['pinterest.com'],
  x: ['x.com', 'twitter.com'],
  behance: ['behance.net'],
};

/** Tracking and share parameters that are never kept. Matching is case-insensitive. */
const TRACKING_PARAMS = new Set([
  'igshid',
  'igsh',
  'vrfl',
  'mibextid',
  'fbclid',
  '_r',
  '_t',
  'si',
  'feature',
  'ref',
  'ref_src',
]);

export type NormalizeResult = { ok: true; url: string } | { ok: false; error: string };

function hostBelongsTo(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Validate and clean a pasted social link (section 4B). The API never stores the
 * raw pasted value: it stores what this function returns.
 */
export function normalizeSocialUrl(platform: SocialPlatform, raw: string): NormalizeResult {
  let input = raw.trim();
  if (input === '') return { ok: false, error: 'Please paste a link.' };
  if (input.length > LIMITS.socialUrlMax) {
    return { ok: false, error: `The link is too long (maximum ${LIMITS.socialUrlMax} characters).` };
  }
  // Friendly: allow "instagram.com/name" without a scheme, but never accept other schemes.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) input = `https://${input}`;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'This does not look like a valid link.' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'The link must start with https://' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, error: 'The link must not contain a username or password.' };
  }

  const host = url.hostname.toLowerCase();
  if (platform !== 'other') {
    const domains = [...PLATFORM_HOSTS[platform]];
    if (platform === 'tiktok') domains.push('vm.tiktok.com');
    if (!hostBelongsTo(host, domains)) {
      const label = PLATFORM_LABELS[platform];
      const article = /^[aeiox]/i.test(label) ? 'an' : 'a';
      return { ok: false, error: `This does not look like ${article} ${label} link.` };
    }
  }

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) continue;
    // Profile links need no other parameters; keep them only for generic links.
    if (platform === 'other') kept.append(key, value);
  }

  let path = url.pathname;
  // Instagram profile links are shown with a trailing slash.
  if (platform === 'instagram' && !path.endsWith('/')) path += '/';

  const query = kept.toString();
  const cleaned = `https://${host}${path === '' ? '/' : path}${query ? `?${query}` : ''}`;
  if (cleaned.length > LIMITS.socialUrlMax) {
    return { ok: false, error: `The link is too long (maximum ${LIMITS.socialUrlMax} characters).` };
  }
  return { ok: true, url: cleaned };
}
