import { pickText, type Locale } from '@flowart/shared';
import type { Env } from '../env';
import { HttpError, nowIso, uuid } from '../lib/http';
import type { z } from 'zod';
import type { aboutInput } from '../schemas';
import { mediaUrl, type PublicImage } from './artworks';
import { deleteVariants, putVariants, type ValidatedUpload } from './images';

interface AboutRow {
  heading: string | null;
  heading_da: string | null;
  body: string;
  body_da: string | null;
  portrait_key_base: string | null;
  portrait_alt: string | null;
  portrait_alt_da: string | null;
  portrait_width: number | null;
  portrait_height: number | null;
  updated_at: string;
}

async function getRow(env: Env): Promise<AboutRow> {
  const row = await env.DB.prepare('SELECT * FROM about_page WHERE id = 1').first<AboutRow>();
  if (!row) throw new HttpError(500, 'missing_content', 'The About page has not been seeded.');
  return row;
}

export interface PublicAbout {
  heading?: string;
  body: string;
  portrait?: PublicImage;
}

/** Public About page. `portrait` is omitted entirely when there is none. */
export async function getPublicAbout(env: Env, lang: Locale): Promise<PublicAbout> {
  const row = await getRow(env);
  const heading = (pickText(lang, row.heading, row.heading_da) ?? '') as string;
  const dto: PublicAbout = {
    ...(heading ? { heading } : {}),
    body: pickText(lang, row.body, row.body_da) as string,
  };
  if (row.portrait_key_base && row.portrait_width && row.portrait_height) {
    dto.portrait = {
      url: mediaUrl(env, row.portrait_key_base),
      alt: (pickText(lang, row.portrait_alt, row.portrait_alt_da) as string) || '',
      width: row.portrait_width,
      height: row.portrait_height,
    };
  }
  return dto;
}

export async function getAdminAbout(env: Env) {
  const row = await getRow(env);
  return {
    heading: row.heading,
    heading_da: row.heading_da,
    body: row.body,
    body_da: row.body_da,
    portrait: row.portrait_key_base
      ? {
          url: mediaUrl(env, row.portrait_key_base),
          alt: row.portrait_alt,
          alt_da: row.portrait_alt_da,
          width: row.portrait_width,
          height: row.portrait_height,
        }
      : null,
    updated_at: row.updated_at,
  };
}

export async function updateAbout(env: Env, input: z.infer<typeof aboutInput>) {
  const row = await getRow(env);
  if (row.portrait_key_base && !input.portrait_alt) {
    throw new HttpError(400, 'validation_error', 'The portrait needs alt text.', {
      fields: { portrait_alt: 'The portrait needs alt text.' },
    });
  }
  await env.DB.prepare(
    `UPDATE about_page SET heading=?1, heading_da=?2, body=?3, body_da=?4,
       portrait_alt = CASE WHEN portrait_key_base IS NULL THEN NULL ELSE ?5 END,
       portrait_alt_da = CASE WHEN portrait_key_base IS NULL THEN NULL ELSE ?6 END
     WHERE id = 1`,
  )
    .bind(input.heading, input.heading_da, input.body, input.body_da, input.portrait_alt, input.portrait_alt_da)
    .run();
  return getAdminAbout(env);
}

/** Replace the portrait; the previous R2 objects are deleted. Alt text is required. */
export async function setPortrait(
  env: Env,
  actor: string,
  upload: ValidatedUpload,
  alt: { alt: string; alt_da: string | null },
) {
  if (!alt.alt.trim()) {
    throw new HttpError(400, 'validation_error', 'The portrait needs alt text.', {
      fields: { portrait_alt: 'The portrait needs alt text.' },
    });
  }
  const old = await getRow(env);
  const base = `site/about/${uuid()}`;
  await putVariants(env.MEDIA, base, upload);
  try {
    await env.DB.prepare(
      `UPDATE about_page SET portrait_key_base=?1, portrait_alt=?2, portrait_alt_da=?3,
         portrait_width=?4, portrait_height=?5, updated_at=?6 WHERE id = 1`,
    )
      .bind(base, alt.alt.trim(), alt.alt_da, upload.width, upload.height, nowIso())
      .run();
  } catch (err) {
    await deleteVariants(env, actor, base);
    throw err;
  }
  if (old.portrait_key_base) await deleteVariants(env, actor, old.portrait_key_base);
  return getAdminAbout(env);
}

export async function removePortrait(env: Env, actor: string) {
  const old = await getRow(env);
  await env.DB.prepare(
    `UPDATE about_page SET portrait_key_base=NULL, portrait_alt=NULL, portrait_alt_da=NULL,
       portrait_width=NULL, portrait_height=NULL, updated_at=?1 WHERE id = 1`,
  )
    .bind(nowIso())
    .run();
  if (old.portrait_key_base) await deleteVariants(env, actor, old.portrait_key_base);
  return getAdminAbout(env);
}
