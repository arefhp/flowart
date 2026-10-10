import { localePath, pickText, slugify, utcToLocal, type Locale } from '@flowart/shared';
import { holdMinutes } from '../config';
import type { Env } from '../env';
import { HttpError, notFound, nowIso, uuid } from '../lib/http';
import { buildIcs } from '../lib/ics';
import type { EventInput } from '../schemas';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface EventRow {
  id: string;
  title: string;
  title_da: string | null;
  slug: string;
  description: string | null;
  description_da: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  location_da: string | null;
  max_participants: number;
  price_minor: number;
  currency: string;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

/** Statuses visitors can see. A draft is never public. */
const PUBLIC_STATUS_SQL = `'published', 'cancelled', 'completed'`;

// ---------------------------------------------------------------------------
// Capacity (spec section 6): places taken = confirmed bookings + unexpired holds on pending ones.
// ---------------------------------------------------------------------------

export interface Booked {
  confirmed: number; // places in confirmed bookings
  held: number; // places held for a booking that is still being paid
  bookings: number; // how many bookings in total (any status), for delete rules
}

export async function bookedByEvent(env: Env, ids: string[]): Promise<Map<string, Booked>> {
  const map = new Map<string, Booked>();
  if (ids.length === 0) return map;
  const placeholders = ids.map((_, i) => `?${i + 2}`).join(',');
  const rows = await env.DB.prepare(
    `SELECT event_id,
            COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN number_of_participants END), 0) AS confirmed,
            COALESCE(SUM(CASE WHEN booking_status = 'pending' AND hold_expires_at > ?1 THEN number_of_participants END), 0) AS held,
            COUNT(*) AS bookings
       FROM event_bookings WHERE event_id IN (${placeholders}) GROUP BY event_id`,
  )
    .bind(nowIso(), ...ids)
    .all<{ event_id: string; confirmed: number; held: number; bookings: number }>();
  for (const r of rows.results) map.set(r.event_id, { confirmed: r.confirmed, held: r.held, bookings: r.bookings });
  return map;
}

const NO_BOOKINGS: Booked = { confirmed: 0, held: 0, bookings: 0 };

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export interface PublicEvent {
  slug: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  /** per person, minor units; 0 = free */
  priceMinor: number;
  currency: string;
  status: 'published' | 'cancelled' | 'completed';
}

function toPublic(row: EventRow, lang: Locale): PublicEvent {
  const description = (pickText(lang, row.description, row.description_da) ?? '') as string;
  const location = (pickText(lang, row.location, row.location_da) ?? '') as string;
  return {
    slug: row.slug,
    title: pickText(lang, row.title, row.title_da) as string,
    ...(description ? { description } : {}),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    ...(location ? { location } : {}),
    priceMinor: row.price_minor,
    currency: row.currency,
    status: row.status as PublicEvent['status'],
  };
}

/**
 * Published, cancelled and finished events, soonest first. Capacity is NOT included: the static
 * pages never carry availability; it is fetched live (see `getAvailability`).
 */
export async function listPublicEvents(env: Env, lang: Locale): Promise<PublicEvent[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM events WHERE status IN (${PUBLIC_STATUS_SQL}) ORDER BY starts_at ASC, id LIMIT 300`,
  ).all<EventRow>();
  return rows.results.map((r) => toPublic(r, lang));
}

async function publicRow(env: Env, slug: string): Promise<EventRow> {
  const row = await env.DB.prepare(`SELECT * FROM events WHERE slug = ?1 AND status IN (${PUBLIC_STATUS_SQL})`)
    .bind(slug)
    .first<EventRow>();
  if (!row) throw notFound('Event not found');
  return row;
}

export async function getPublicEvent(env: Env, slug: string, lang: Locale): Promise<PublicEvent> {
  return toPublic(await publicRow(env, slug), lang);
}

export interface Availability {
  slug: string;
  status: PublicEvent['status'];
  isPast: boolean;
  maxParticipants: number;
  /** places taken: confirmed plus unexpired holds */
  taken: number;
  remaining: number;
  soldOut: boolean;
  /** open for booking right now (published, not started, places left) */
  bookable: boolean;
  maxPerBooking: number;
  /** minutes unpaid places are held, shown on the booking form */
  holdMinutes: number;
}

function availabilityFor(row: EventRow, booked: Booked, env: Env, now = Date.now()): Availability {
  const taken = booked.confirmed + booked.held;
  const remaining = Math.max(0, row.max_participants - taken);
  const isPast = Date.parse(row.starts_at) <= now;
  const maxPerBooking = Math.max(1, Number(env.BOOKING_MAX_PARTICIPANTS ?? '10') || 10);
  return {
    slug: row.slug,
    status: row.status as PublicEvent['status'],
    isPast,
    maxParticipants: row.max_participants,
    taken,
    remaining,
    soldOut: remaining === 0,
    bookable: row.status === 'published' && !isPast && remaining > 0,
    maxPerBooking: Math.min(maxPerBooking, Math.max(remaining, 1)),
    holdMinutes: holdMinutes(env),
  };
}

/** Live capacity of one event (never cached, never baked into static pages). */
export async function getAvailability(env: Env, slug: string): Promise<Availability> {
  const row = await publicRow(env, slug);
  const booked = (await bookedByEvent(env, [row.id])).get(row.id) ?? NO_BOOKINGS;
  return availabilityFor(row, booked, env);
}

/** Remaining places for every upcoming published event in one request (calendar and list pages). */
export async function getAllAvailability(env: Env): Promise<Array<Pick<Availability, 'slug' | 'remaining' | 'soldOut' | 'bookable'>>> {
  const rows = await env.DB.prepare(
    `SELECT * FROM events WHERE status = 'published' AND starts_at > ?1 ORDER BY starts_at LIMIT 300`,
  )
    .bind(nowIso())
    .all<EventRow>();
  const booked = await bookedByEvent(env, rows.results.map((r) => r.id));
  return rows.results.map((r) => {
    const a = availabilityFor(r, booked.get(r.id) ?? NO_BOOKINGS, env);
    return { slug: a.slug, remaining: a.remaining, soldOut: a.soldOut, bookable: a.bookable };
  });
}

/** The .ics file for "Add to calendar". */
export async function getEventIcs(env: Env, slug: string, lang: Locale): Promise<string> {
  const row = await publicRow(env, slug);
  const e = toPublic(row, lang);
  const url = `${env.PUBLIC_SITE_URL.replace(/\/+$/, '')}${localePath(lang, `/workshops/${row.slug}`)}`;
  return buildIcs({
    uid: `${row.id}@zfadavi.com`,
    title: e.title,
    description: [e.description, url].filter(Boolean).join('\n\n'),
    location: e.location,
    url,
    startsAtIso: row.starts_at,
    endsAtIso: row.ends_at,
    cancelled: row.status === 'cancelled',
    modifiedIso: row.updated_at,
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function adminEventDto(row: EventRow, booked: Booked) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    title_da: row.title_da,
    description: row.description,
    description_da: row.description_da,
    location: row.location,
    location_da: row.location_da,
    // what the form shows: wall-clock time in the event's own zone
    starts_local: utcToLocal(row.starts_at, row.timezone),
    ends_local: utcToLocal(row.ends_at, row.timezone),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    max_participants: row.max_participants,
    price_minor: row.price_minor,
    currency: row.currency,
    status: row.status,
    booked_confirmed: booked.confirmed,
    booked_held: booked.held,
    bookings_total: booked.bookings,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getRow(env: Env, id: string): Promise<EventRow> {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ?1').bind(id).first<EventRow>();
  if (!row) throw notFound('Event not found');
  return row;
}

async function dto(env: Env, row: EventRow) {
  const booked = (await bookedByEvent(env, [row.id])).get(row.id) ?? NO_BOOKINGS;
  return adminEventDto(row, booked);
}

export async function listAdminEvents(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM events ORDER BY starts_at DESC, id').all<EventRow>();
  const booked = await bookedByEvent(env, rows.results.map((r) => r.id));
  return rows.results.map((r) => adminEventDto(r, booked.get(r.id) ?? NO_BOOKINGS));
}

export async function getAdminEvent(env: Env, id: string) {
  return dto(env, await getRow(env, id));
}

async function uniqueSlug(env: Env, title: string, startsAt: string): Promise<string> {
  const base = slugify(title);
  const day = startsAt.slice(0, 10);
  const tries = [base, `${base}-${day}`];
  for (let n = 2; n < 40; n++) tries.push(`${base}-${day}-${n}`);
  for (const candidate of tries) {
    const taken = await env.DB.prepare('SELECT 1 AS x FROM events WHERE slug = ?1').bind(candidate).first();
    if (!taken) return candidate;
  }
  return `${base}-${uuid().slice(0, 8)}`;
}

/** A new event is always created as a DRAFT; the owner publishes it when it is ready. */
export async function createEvent(env: Env, input: EventInput) {
  const id = uuid();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO events (id, title, title_da, slug, description, description_da, starts_at, ends_at, timezone,
       location, location_da, max_participants, price_minor, currency, status, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'draft',?15,?15)`,
  )
    .bind(
      id,
      input.title,
      input.title_da,
      await uniqueSlug(env, input.title, input.starts_at),
      input.description,
      input.description_da,
      input.starts_at,
      input.ends_at,
      input.timezone,
      input.location,
      input.location_da,
      input.max_participants,
      input.price_minor,
      input.currency,
      now,
    )
    .run();
  return getAdminEvent(env, id);
}

export async function updateEvent(env: Env, id: string, input: EventInput) {
  const row = await getRow(env, id);
  if (row.status === 'cancelled' || row.status === 'completed') {
    throw new HttpError(409, 'not_editable', `A ${row.status} event can no longer be edited.`);
  }
  const booked = (await bookedByEvent(env, [id])).get(id) ?? NO_BOOKINGS;
  const taken = booked.confirmed + booked.held;
  if (input.max_participants < taken) {
    throw new HttpError(
      400,
      'capacity_below_booked',
      `${taken} place${taken === 1 ? ' is' : 's are'} already booked, so the number of places cannot be lower than ${taken}.`,
      { fields: { max_participants: `At least ${taken}, because that many places are already booked.` } },
    );
  }
  await env.DB.prepare(
    `UPDATE events SET title=?2, title_da=?3, description=?4, description_da=?5, starts_at=?6, ends_at=?7, timezone=?8,
       location=?9, location_da=?10, max_participants=?11, price_minor=?12, currency=?13 WHERE id=?1`,
  )
    .bind(
      id,
      input.title,
      input.title_da,
      input.description,
      input.description_da,
      input.starts_at,
      input.ends_at,
      input.timezone,
      input.location,
      input.location_da,
      input.max_participants,
      input.price_minor,
      input.currency,
    )
    .run();
  return getAdminEvent(env, id);
}

/** draft to published. Only an event that has not started yet can be published. */
export async function publishEvent(env: Env, id: string) {
  const row = await getRow(env, id);
  if (row.status !== 'draft') throw new HttpError(409, 'not_a_draft', 'Only a draft can be published.');
  if (Date.parse(row.starts_at) <= Date.now()) {
    throw new HttpError(400, 'in_the_past', 'The start is in the past. Change the date and time first.', {
      fields: { starts_local: 'The start must be in the future to publish.' },
    });
  }
  await env.DB.prepare(`UPDATE events SET status = 'published' WHERE id = ?1`).bind(id).run();
  return getAdminEvent(env, id);
}

/** published back to draft (hides it from visitors). Not possible once anyone has booked. */
export async function unpublishEvent(env: Env, id: string) {
  const row = await getRow(env, id);
  if (row.status !== 'published') throw new HttpError(409, 'not_published', 'Only a published event can go back to draft.');
  const booked = (await bookedByEvent(env, [id])).get(id) ?? NO_BOOKINGS;
  if (booked.confirmed + booked.held > 0) {
    throw new HttpError(409, 'has_bookings', 'This event has bookings, so it cannot go back to draft. Cancel it instead.');
  }
  await env.DB.prepare(`UPDATE events SET status = 'draft' WHERE id = ?1`).bind(id).run();
  return getAdminEvent(env, id);
}

/** Delete an event that nobody has ever booked. Anything with booking history is cancelled instead. */
export async function deleteEvent(env: Env, id: string): Promise<void> {
  await getRow(env, id);
  const booked = (await bookedByEvent(env, [id])).get(id) ?? NO_BOOKINGS;
  if (booked.bookings > 0) {
    throw new HttpError(409, 'has_bookings', 'This event has booking records, so it cannot be deleted. Cancel it instead.');
  }
  await env.DB.prepare('DELETE FROM events WHERE id = ?1').bind(id).run();
}

/** Cron: a published event whose end has passed becomes "completed". */
export async function completePastEvents(env: Env): Promise<number> {
  // RETURNING gives the real count: `meta.changes` would also count the updated_at trigger's own write
  const res = await env.DB.prepare(
    `UPDATE events SET status = 'completed' WHERE status = 'published' AND ends_at < ?1 RETURNING id`,
  )
    .bind(nowIso())
    .all<{ id: string }>();
  return res.results.length;
}
