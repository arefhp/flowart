import { ARTWORK_STATUSES, LIMITS, LOCALES, SIZE_CLASSES, SOCIAL_PLATFORMS } from '@flowart/shared';
import { z } from 'zod';
import { isValidEmail } from './email';
import { HttpError } from './lib/http';

/** Optional text: trims, caps the length, and turns "" into null. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please use at most ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null));

const requiredText = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required.`).max(max, `Please use at most ${max} characters.`);

const optNumber = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? null : v));

export const artworkInput = z
  .object({
    title: requiredText(LIMITS.titleMax, 'The English title'),
    title_da: optText(LIMITS.titleMax),
    description: optText(LIMITS.descriptionMax),
    description_da: optText(LIMITS.descriptionMax),
    /** Minor units (øre/cents). null or missing = no price (never shown publicly). */
    price_minor: z.number().int().min(0).max(1_000_000_000).nullish().transform((v) => (v === undefined ? null : v)),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as DKK.')
      .nullish()
      .transform((v) => (v ? v : null)),
    width_cm: optNumber(0.1, 100000),
    height_cm: optNumber(0.1, 100000),
    depth_cm: optNumber(0.1, 100000),
    medium: optText(LIMITS.mediumMax),
    medium_da: optText(LIMITS.mediumMax),
    year: z.number().int().min(1000).max(3000).nullish().transform((v) => (v === undefined ? null : v)),
    status: z.enum(ARTWORK_STATUSES),
    featured: z.boolean().default(false),
    /** The owner chooses both when adding an artwork; visitors can filter by them. */
    category_id: z.string().trim().min(1, 'Choose a category.'),
    size_class: z.enum(SIZE_CLASSES, { error: 'Choose Small, Medium or Large.' }),
  })
  .superRefine((v, ctx) => {
    if (v.price_minor !== null && v.currency === null) {
      ctx.addIssue({ code: 'custom', path: ['currency'], message: 'Choose a currency when a price is set.' });
    }
  })
  .transform((v) => ({
    ...v,
    // No price means no currency either (the database requires them together).
    currency: v.price_minor === null ? null : v.currency,
  }));
export type ArtworkInput = z.infer<typeof artworkInput>;

export const imageAltInput = z.object({
  alt_text: z.string().trim().max(LIMITS.altTextMax).default(''),
  alt_text_da: optText(LIMITS.altTextMax),
});

export const categoryInput = z.object({
  name: requiredText(LIMITS.categoryNameMax, 'The English name'),
  name_da: optText(LIMITS.categoryNameMax),
});

export const coverInput = z.object({ imageId: z.string().min(1).nullable() });
export const orderInput = z.object({ ids: z.array(z.string().min(1)).max(LIMITS.imagesPerArtworkMax) });

export const aboutInput = z.object({
  heading: optText(LIMITS.aboutHeadingMax),
  heading_da: optText(LIMITS.aboutHeadingMax),
  body: requiredText(LIMITS.aboutBodyMax, 'The English text'),
  body_da: optText(LIMITS.aboutBodyMax),
  portrait_alt: optText(LIMITS.altTextMax),
  portrait_alt_da: optText(LIMITS.altTextMax),
});

export const socialInput = z.object({
  links: z
    .array(
      z.object({
        id: z.string().min(1).nullish(),
        platform: z.enum(SOCIAL_PLATFORMS),
        url: z.string(),
        label: optText(LIMITS.socialLabelMax),
        visible: z.boolean(),
      }),
    )
    .max(LIMITS.socialLinksMax, `You can have at most ${LIMITS.socialLinksMax} links.`),
});

export const contactInput = z.object({
  name: requiredText(LIMITS.contactNameMax, 'Your name'),
  email: z
    .string()
    .trim()
    .refine((v) => isValidEmail(v), 'Please enter a valid email address.'),
  message: z
    .string()
    .trim()
    .min(LIMITS.contactMessageMin, 'Please write a short message.')
    .max(LIMITS.contactMessageMax, `Please use at most ${LIMITS.contactMessageMax} characters.`),
  locale: z.enum(LOCALES).default('en'),
  artworkSlug: z.string().trim().max(120).nullish(),
  turnstileToken: z.string().max(4096).optional(),
});

/** Parse with zod and throw the API's consistent 400 error with per-field messages. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Invalid request.';
  throw new HttpError(400, 'validation_error', first, { fields });
}

export async function readJson(request: Request, maxBytes = 200_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'The request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
}
