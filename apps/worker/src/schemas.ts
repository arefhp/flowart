import {
  ARTWORK_STATUSES,
  DEFAULT_TIMEZONE,
  LIMITS,
  LOCALES,
  SIZE_CLASSES,
  SOCIAL_PLATFORMS,
  isValidTimeZone,
  localToUtc,
} from '@flowart/shared';
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

const MAX_EVENT_DAYS = 14;

/** Local start/end (typed in the event's own time zone) to UTC instants, with plain-language errors. */
function eventTimes(v: { starts_local: string; ends_local: string; timezone: string }) {
  const errors: Array<{ path: string; message: string }> = [];
  if (!isValidTimeZone(v.timezone)) errors.push({ path: 'timezone', message: 'This time zone is not recognised.' });
  const start = errors.length ? null : localToUtc(v.starts_local, v.timezone);
  const end = errors.length ? null : localToUtc(v.ends_local, v.timezone);
  const gap = 'That time does not exist: the clocks go forward then. Choose a different time.';
  if (start && !start.ok) errors.push({ path: 'starts_local', message: start.reason === 'nonexistent' ? gap : 'Enter the start date and time.' });
  if (end && !end.ok) errors.push({ path: 'ends_local', message: end.reason === 'nonexistent' ? gap : 'Enter the end date and time.' });
  if (start?.ok && end?.ok) {
    const ms = Date.parse(end.utc) - Date.parse(start.utc);
    if (ms <= 0) errors.push({ path: 'ends_local', message: 'The end must be after the start.' });
    else if (ms > MAX_EVENT_DAYS * 86_400_000) errors.push({ path: 'ends_local', message: `An event can last at most ${MAX_EVENT_DAYS} days.` });
  }
  return { errors, starts_at: start?.ok ? start.utc : '', ends_at: end?.ok ? end.utc : '' };
}

/**
 * A workshop or event. The admin types LOCAL time ("2026-11-14T10:00") in the event's time zone;
 * the stored values are UTC instants (spec section 5: no separate date/time/zone columns).
 */
export const eventInput = z
  .object({
    title: requiredText(LIMITS.titleMax, 'The English title'),
    title_da: optText(LIMITS.titleMax),
    description: optText(LIMITS.descriptionMax),
    description_da: optText(LIMITS.descriptionMax),
    location: optText(200),
    location_da: optText(200),
    starts_local: z.string().trim(),
    ends_local: z.string().trim(),
    timezone: z.string().trim().default(DEFAULT_TIMEZONE),
    max_participants: z.number({ error: 'Enter the number of places.' }).int('Use a whole number.').min(1, 'There must be at least 1 place.').max(200, 'At most 200 places.'),
    /** per person, in minor units (øre). 0 = free. */
    price_minor: z.number({ error: 'Enter the price per person.' }).int().min(0, 'The price cannot be negative.').max(100_000_000),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as DKK.')
      .default('DKK'),
  })
  .superRefine((v, ctx) => {
    for (const e of eventTimes(v).errors) ctx.addIssue({ code: 'custom', path: [e.path], message: e.message });
  })
  .transform((v) => {
    const { starts_at, ends_at } = eventTimes(v);
    return { ...v, starts_at, ends_at };
  });
export type EventInput = z.infer<typeof eventInput>;

export const eventCancelInput = z.object({ confirm: z.boolean().optional() });

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

export const bookingInput = z.object({
  name: requiredText(LIMITS.contactNameMax, 'Your name'),
  email: z
    .string()
    .trim()
    .refine((v) => isValidEmail(v), 'Please enter a valid email address.'),
  phone: optText(40),
  participants: z
    .number({ error: 'Choose how many places.' })
    .int('Choose how many places.')
    .min(1, 'Choose at least 1 place.')
    .max(100, 'Choose how many places.'),
  locale: z.enum(LOCALES).default('en'),
  consent: z.literal(true, { error: 'Please tick the box to continue.' }),
  turnstileToken: z.string().max(4096).optional(),
});
export type BookingInput = z.infer<typeof bookingInput>;

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
