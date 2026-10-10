import { normalizeSocialUrl, platformLabel, type SocialPlatform } from '@flowart/shared';
import type { Env } from '../env';
import { HttpError, nowIso, uuid } from '../lib/http';

interface SocialRow {
  id: string;
  platform: SocialPlatform;
  url: string;
  label: string | null;
  visible: number;
  sort_order: number;
}

export interface PublicSocialLink {
  platform: SocialPlatform;
  label: string;
  url: string;
}

/**
 * Public links: only visible rows, in order. Nothing else leaks (no id, visible, sort_order).
 * An empty array means the site renders no social section at all.
 */
export async function getPublicSocial(env: Env): Promise<{ links: PublicSocialLink[] }> {
  const rows = await env.DB.prepare('SELECT * FROM social_links WHERE visible = 1 ORDER BY sort_order, created_at').all<SocialRow>();
  return {
    links: rows.results.map((r) => ({
      platform: r.platform,
      label: r.label?.trim() ? r.label : platformLabel(r.platform),
      url: r.url,
    })),
  };
}

export async function getAdminSocial(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM social_links ORDER BY sort_order, created_at').all<SocialRow>();
  return {
    links: rows.results.map((r) => ({
      id: r.id,
      platform: r.platform,
      url: r.url,
      label: r.label,
      visible: r.visible === 1,
    })),
  };
}

export interface SocialInputRow {
  id?: string | null;
  platform: SocialPlatform;
  url: string;
  label: string | null;
  visible: boolean;
}

/**
 * Replace the whole ordered list atomically. Every row is validated and normalized; the raw
 * pasted value is never stored. One link per platform, except "other".
 */
export async function replaceSocial(env: Env, links: SocialInputRow[]) {
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  const cleaned: { id: string; platform: SocialPlatform; url: string; label: string | null; visible: boolean }[] = [];

  links.forEach((link, i) => {
    if (link.platform !== 'other') {
      if (seen.has(link.platform)) {
        fields[`links.${i}.platform`] = `You already have a ${platformLabel(link.platform)} link.`;
        return;
      }
      seen.add(link.platform);
    }
    if (link.platform === 'other' && !link.label) {
      fields[`links.${i}.label`] = 'Please give this link a name.';
    }
    const result = normalizeSocialUrl(link.platform, link.url);
    if (!result.ok) {
      fields[`links.${i}.url`] = result.error;
      return;
    }
    cleaned.push({
      id: link.id || uuid(),
      platform: link.platform,
      url: result.url,
      label: link.label,
      visible: link.visible,
    });
  });

  if (Object.keys(fields).length) {
    throw new HttpError(400, 'validation_error', Object.values(fields)[0]!, { fields });
  }

  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM social_links'),
    ...cleaned.map((c, index) =>
      env.DB.prepare(
        `INSERT INTO social_links (id, platform, url, label, visible, sort_order, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)`,
      ).bind(c.id, c.platform, c.url, c.label, c.visible ? 1 : 0, index + 1, now),
    ),
  ]);
  return getAdminSocial(env);
}
