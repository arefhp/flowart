import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { completePastEvents } from '../src/services/events';
import { FREQUENT_CRON, runScheduled } from '../src/scheduled';
import { adminJson, baseEvent, call, insertBooking, insertEvent, testEnv } from './helpers';

type Ev = {
  id: string;
  slug: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
  starts_local: string;
  ends_local: string;
  booked_confirmed: number;
  booked_held: number;
  bookings_total: number;
};

const create = (extra: Record<string, unknown> = {}) => adminJson('/api/admin/events', 'POST', { ...baseEvent, ...extra });
const created = async (extra: Record<string, unknown> = {}) => {
  const res = await create(extra);
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await res.json()) as Ev;
};
const fieldError = async (res: Response) =>
  ((await res.json()) as { error: { message: string; details?: { fields?: Record<string, string> } } }).error;

const FUTURE_HOLD = new Date(Date.now() + 20 * 60_000).toISOString();
const PAST_HOLD = new Date(Date.now() - 5 * 60_000).toISOString();

describe('creating an event: local Copenhagen time becomes UTC', () => {
  it('creates a DRAFT with a slug; summer 10:00 is 08:00 UTC', async () => {
    const ev = await created();
    expect(ev.status).toBe('draft');
    expect(ev.slug).toBe('oil-painting-workshop');
    expect(ev.starts_at).toBe('2030-05-10T08:00:00.000Z');
    expect(ev.ends_at).toBe('2030-05-10T11:00:00.000Z');
    expect(ev.starts_local).toBe('2030-05-10T10:00'); // the form shows what was typed
  });

  it('winter 10:00 is 09:00 UTC', async () => {
    const ev = await created({ starts_local: '2030-01-10T10:00', ends_local: '2030-01-10T12:00' });
    expect(ev.starts_at).toBe('2030-01-10T09:00:00.000Z');
  });

  it('DST spring: 31 March 2030 at 02:30 does not exist and is refused with a clear message', async () => {
    const res = await create({ starts_local: '2030-03-31T02:30', ends_local: '2030-03-31T05:00' });
    expect(res.status).toBe(400);
    const err = await fieldError(res);
    expect(err.details!.fields!.starts_local).toContain('clocks go forward');
    // the hour either side is fine
    expect((await created({ starts_local: '2030-03-31T01:30', ends_local: '2030-03-31T05:00' })).starts_at).toBe('2030-03-31T00:30:00.000Z');
    expect((await created({ title: 'Other', starts_local: '2030-03-31T03:00', ends_local: '2030-03-31T05:00' })).starts_at).toBe('2030-03-31T01:00:00.000Z');
  });

  it('DST autumn: 27 October 2030 at 02:30 happens twice and the first (summer time) is used', async () => {
    const ev = await created({ starts_local: '2030-10-27T02:30', ends_local: '2030-10-27T04:30' });
    expect(ev.starts_at).toBe('2030-10-27T00:30:00.000Z');
    expect(ev.ends_at).toBe('2030-10-27T03:30:00.000Z'); // 04:30 is already winter time
    expect(ev.starts_local).toBe('2030-10-27T02:30');
  });

  it('an event across the clock change has its real length', async () => {
    const ev = await created({ starts_local: '2030-03-30T22:00', ends_local: '2030-03-31T04:00' });
    expect((Date.parse(ev.ends_at) - Date.parse(ev.starts_at)) / 3_600_000).toBe(5);
  });

  it('another time zone is converted with its own rules', async () => {
    const ev = await created({ timezone: 'America/New_York', starts_local: '2030-07-01T09:00', ends_local: '2030-07-01T11:00' });
    expect(ev.starts_at).toBe('2030-07-01T13:00:00.000Z');
    expect(ev.starts_local).toBe('2030-07-01T09:00');
  });

  it('gives events with the same title unique addresses', async () => {
    const a = await created();
    const b = await created();
    const c = await created();
    expect(a.slug).toBe('oil-painting-workshop');
    expect(b.slug).toBe('oil-painting-workshop-2030-05-10');
    expect(c.slug).toBe('oil-painting-workshop-2030-05-10-2');
  });

  it('a free event (price 0) is allowed', async () => {
    const ev = await created({ price_minor: 0 });
    expect(await (await call(`/api/admin/events/${ev.id}`)).json()).toMatchObject({ price_minor: 0 });
  });
});

describe('event validation (plain-language messages, per field)', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['no English title', { title: '   ' }, 'title'],
    ['end before start', { ends_local: '2030-05-10T09:00' }, 'ends_local'],
    ['end equal to start', { ends_local: '2030-05-10T10:00' }, 'ends_local'],
    ['longer than 14 days', { ends_local: '2030-06-10T10:00' }, 'ends_local'],
    ['start not a date', { starts_local: 'tomorrow morning' }, 'starts_local'],
    ['impossible date', { starts_local: '2030-02-30T10:00' }, 'starts_local'],
    ['end not a date', { ends_local: '' }, 'ends_local'],
    ['unknown time zone', { timezone: 'Mars/Olympus' }, 'timezone'],
    ['zero places', { max_participants: 0 }, 'max_participants'],
    ['too many places', { max_participants: 201 }, 'max_participants'],
    ['half a place', { max_participants: 2.5 }, 'max_participants'],
    ['negative price', { price_minor: -1 }, 'price_minor'],
    ['bad currency', { currency: 'DANISH' }, 'currency'],
  ];
  for (const [name, extra, field] of cases) {
    it(`rejects: ${name}`, async () => {
      const res = await create(extra);
      expect(res.status).toBe(400);
      expect(Object.keys((await fieldError(res)).details!.fields!)).toContain(field);
    });
  }

  it('accepts the Danish fields as optional', async () => {
    const ev = await created({ title_da: 'Maleworkshop', description_da: 'Dansk tekst', location_da: 'Atelieret' });
    expect(ev.title).toBe('Oil Painting Workshop');
  });
});

describe('editing, publishing and cancelling', () => {
  it('updates a draft and keeps its address', async () => {
    const ev = await created();
    const res = await adminJson(`/api/admin/events/${ev.id}`, 'PUT', { ...baseEvent, title: 'Renamed', max_participants: 12 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Renamed', slug: 'oil-painting-workshop', max_participants: 12 });
  });

  it('publishes a draft, and refuses to publish one that is in the past or already published', async () => {
    const ev = await created();
    const published = await adminJson(`/api/admin/events/${ev.id}/publish`, 'POST', {});
    expect(published.status).toBe(200);
    expect(((await published.json()) as Ev).status).toBe('published');
    expect((await adminJson(`/api/admin/events/${ev.id}/publish`, 'POST', {})).status).toBe(409);

    const past = await insertEvent({ status: 'draft', starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    const res = await adminJson(`/api/admin/events/${past.id}/publish`, 'POST', {});
    expect(res.status).toBe(400);
    expect((await fieldError(res)).message).toContain('in the past');
  });

  it('unpublish returns a published event to draft, unless someone has booked', async () => {
    const free = await insertEvent();
    expect(await (await adminJson(`/api/admin/events/${free.id}/unpublish`, 'POST', {})).json()).toMatchObject({ status: 'draft' });

    const booked = await insertEvent();
    await insertBooking(booked.id, { participants: 2 });
    const res = await adminJson(`/api/admin/events/${booked.id}/unpublish`, 'POST', {});
    expect(res.status).toBe(409);
    expect((await fieldError(res)).message).toContain('has bookings');
  });

  it('cancel makes the event cancelled; twice is refused; an event with booked places cannot be cancelled yet', async () => {
    const ev = await insertEvent();
    expect(await (await adminJson(`/api/admin/events/${ev.id}/cancel`, 'POST', {})).json()).toMatchObject({ status: 'cancelled' });
    expect((await adminJson(`/api/admin/events/${ev.id}/cancel`, 'POST', {})).status).toBe(409);

    const withBooking = await insertEvent();
    await insertBooking(withBooking.id);
    const res = await adminJson(`/api/admin/events/${withBooking.id}/cancel`, 'POST', {});
    expect(res.status).toBe(409);
    expect((await fieldError(res)).message).toContain('Milestone 3');
    expect(((await (await call(`/api/admin/events/${withBooking.id}`)).json()) as Ev).status).toBe('published'); // untouched
  });

  it('a cancelled or completed event can no longer be edited', async () => {
    const ev = await insertEvent({ status: 'cancelled' });
    expect((await adminJson(`/api/admin/events/${ev.id}`, 'PUT', baseEvent)).status).toBe(409);
    const done = await insertEvent({ status: 'completed' });
    expect((await adminJson(`/api/admin/events/${done.id}`, 'PUT', baseEvent)).status).toBe(409);
  });

  it('the number of places cannot be set below what is already booked (confirmed + held)', async () => {
    const ev = await insertEvent({ max_participants: 10 });
    await insertBooking(ev.id, { participants: 3 });
    await insertBooking(ev.id, { participants: 2, booking_status: 'pending', payment_status: 'pending', hold_expires_at: FUTURE_HOLD });
    const body = { ...baseEvent, max_participants: 4 };
    const res = await adminJson(`/api/admin/events/${ev.id}`, 'PUT', body);
    expect(res.status).toBe(400);
    expect((await fieldError(res)).details!.fields!.max_participants).toContain('At least 5');
    expect((await adminJson(`/api/admin/events/${ev.id}`, 'PUT', { ...baseEvent, max_participants: 5 })).status).toBe(200);
  });

  it('delete works for an event nobody booked, not for one with booking records', async () => {
    const free = await insertEvent();
    expect((await adminJson(`/api/admin/events/${free.id}`, 'DELETE')).status).toBe(200);
    expect((await call(`/api/admin/events/${free.id}`)).status).toBe(404);

    const had = await insertEvent();
    await insertBooking(had.id, { booking_status: 'cancelled', payment_status: 'refunded' });
    expect((await adminJson(`/api/admin/events/${had.id}`, 'DELETE')).status).toBe(409);
    // the database refuses too
    await expect(env.DB.prepare('DELETE FROM events WHERE id = ?1').bind(had.id).run()).rejects.toThrow();
  });

  it('records changes in the audit log', async () => {
    const ev = await created();
    await adminJson(`/api/admin/events/${ev.id}/publish`, 'POST', {});
    const rows = await env.DB.prepare(`SELECT action FROM audit_log WHERE action LIKE 'event.%' ORDER BY at`).all<{ action: string }>();
    expect(rows.results.map((r) => r.action)).toEqual(['event.create', 'event.publish']);
  });

  it('the database itself refuses an event that ends before it starts or has no places', async () => {
    await expect(insertEvent({ ends_at: '2030-05-10T07:00:00.000Z' })).rejects.toThrow();
    await expect(insertEvent({ max_participants: 0 })).rejects.toThrow();
  });
});

describe('the admin list shows booked places', () => {
  it('counts confirmed places and unexpired holds, not expired holds or cancelled bookings', async () => {
    const ev = await insertEvent({ max_participants: 20 });
    await insertBooking(ev.id, { participants: 3 });
    await insertBooking(ev.id, { participants: 2, booking_status: 'pending', payment_status: 'pending', hold_expires_at: FUTURE_HOLD });
    await insertBooking(ev.id, { participants: 4, booking_status: 'pending', payment_status: 'pending', hold_expires_at: PAST_HOLD });
    await insertBooking(ev.id, { participants: 1, booking_status: 'cancelled', payment_status: 'refunded' });
    const list = (await (await call('/api/admin/events')).json()) as { events: Ev[] };
    expect(list.events[0]).toMatchObject({ booked_confirmed: 3, booked_held: 2, bookings_total: 4 });
  });
});

describe('what visitors can see', () => {
  it('never shows a draft: not in the list, the page, the availability or the calendar file', async () => {
    const draft = await insertEvent({ status: 'draft', title: 'Secret draft' });
    const list = (await (await call('/api/events')).json()) as { events: unknown[] };
    expect(JSON.stringify(list)).not.toContain('Secret draft');
    for (const path of [`/api/events/${draft.slug}`, `/api/events/${draft.slug}/availability`, `/api/events/${draft.slug}/ics`]) {
      expect((await call(path)).status, path).toBe(404);
    }
    expect(JSON.stringify(await (await call('/api/events/availability')).json())).not.toContain(draft.slug);
  });

  it('lists published, cancelled and completed events, soonest first, in the visitor\'s language', async () => {
    await insertEvent({ title: 'Later', starts_at: '2031-01-10T09:00:00.000Z', ends_at: '2031-01-10T12:00:00.000Z' });
    await insertEvent({ title: 'Sooner', title_da: 'Tidligere', starts_at: '2030-02-10T09:00:00.000Z', ends_at: '2030-02-10T12:00:00.000Z', status: 'cancelled' });
    await insertEvent({ title: 'Old', starts_at: '2020-02-10T09:00:00.000Z', ends_at: '2020-02-10T12:00:00.000Z', status: 'completed' });
    const en = (await (await call('/api/events')).json()) as { events: Array<{ title: string; status: string }> };
    expect(en.events.map((e) => `${e.title}:${e.status}`)).toEqual(['Old:completed', 'Sooner:cancelled', 'Later:published']);
    const da = (await (await call('/api/events?lang=da')).json()) as { events: Array<{ title: string }> };
    expect(da.events.map((e) => e.title)).toEqual(['Old', 'Tidligere', 'Later']); // Danish where it exists, else English
  });

  it('the public event carries the time (UTC + zone), place and price, but NEVER capacity or bookings', async () => {
    const ev = await insertEvent({ title: 'Public one', location_da: 'Atelieret' });
    const body = await (await call(`/api/events/${ev.slug}`)).text();
    const json = JSON.parse(body);
    expect(json).toMatchObject({
      slug: ev.slug,
      title: 'Public one',
      startsAt: '2030-05-10T08:00:00.000Z',
      endsAt: '2030-05-10T11:00:00.000Z',
      timezone: 'Europe/Copenhagen',
      priceMinor: 45000,
      currency: 'DKK',
      status: 'published',
    });
    for (const secret of ['max_participants', 'maxParticipants', 'booked', 'remaining', 'public_token', 'customer', '_da']) {
      expect(body, secret).not.toContain(secret);
    }
    const da = (await (await call(`/api/events/${ev.slug}?lang=da`)).json()) as { location: string };
    expect(da.location).toBe('Atelieret');
  });

  it('omits empty description and location instead of showing blanks', async () => {
    const ev = await insertEvent({ description: null, location: null });
    const json = (await (await call(`/api/events/${ev.slug}`)).json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty('description');
    expect(json).not.toHaveProperty('location');
  });
});

describe('live availability', () => {
  it('remaining = places - confirmed - unexpired holds; expired holds are released', async () => {
    const ev = await insertEvent({ max_participants: 8 });
    await insertBooking(ev.id, { participants: 3 });
    await insertBooking(ev.id, { participants: 2, booking_status: 'pending', payment_status: 'pending', hold_expires_at: FUTURE_HOLD });
    await insertBooking(ev.id, { participants: 4, booking_status: 'pending', payment_status: 'pending', hold_expires_at: PAST_HOLD }); // released
    const res = await call(`/api/events/${ev.slug}/availability`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ maxParticipants: 8, taken: 5, remaining: 3, soldOut: false, bookable: true, isPast: false, maxPerBooking: 3 });
  });

  it('a full event is sold out and not bookable; a cancelled one is never bookable', async () => {
    const full = await insertEvent({ max_participants: 2 });
    await insertBooking(full.id, { participants: 2 });
    expect(await (await call(`/api/events/${full.slug}/availability`)).json()).toMatchObject({ remaining: 0, soldOut: true, bookable: false });

    const cancelled = await insertEvent({ status: 'cancelled' });
    expect(await (await call(`/api/events/${cancelled.slug}/availability`)).json()).toMatchObject({ status: 'cancelled', bookable: false });
  });

  it('a past event is marked past and not bookable', async () => {
    const past = await insertEvent({ status: 'published', starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    expect(await (await call(`/api/events/${past.slug}/availability`)).json()).toMatchObject({ isPast: true, bookable: false });
  });

  it('the most places one booking can take is capped by the setting and by what is left', async () => {
    const roomy = await insertEvent({ max_participants: 40 });
    expect(await (await call(`/api/events/${roomy.slug}/availability`)).json()).toMatchObject({ maxPerBooking: 10 });
    const cap = await (await call(`/api/events/${roomy.slug}/availability`, {}, { BOOKING_MAX_PARTICIPANTS: '4' })).json();
    expect(cap).toMatchObject({ maxPerBooking: 4 });
  });

  it('the batch endpoint lists only upcoming published events, uncached', async () => {
    const up = await insertEvent({ max_participants: 6 });
    await insertBooking(up.id, { participants: 2 });
    await insertEvent({ status: 'cancelled' });
    await insertEvent({ status: 'published', starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    const res = await call('/api/events/availability');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(((await res.json()) as { events: unknown[] }).events).toEqual([{ slug: up.slug, remaining: 4, soldOut: false, bookable: true }]);
  });
});

describe('the calendar file (.ics)', () => {
  it('is a calendar download with correct UTC times and details', async () => {
    const ev = await insertEvent({ title: 'Paint, Sip; Relax', location: 'Studio 3, Copenhagen', description: 'Line one\nLine two' });
    const res = await call(`/api/events/${ev.slug}/ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="${ev.slug}.ics"`);
    const text = await res.text();
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART:20300510T080000Z');
    expect(text).toContain('DTEND:20300510T110000Z');
    expect(text).toContain('SUMMARY:Paint\\, Sip\\; Relax'); // commas and semicolons escaped
    expect(text).toContain('LOCATION:Studio 3\\, Copenhagen');
    expect(text).toContain('Line one\\nLine two');
    expect(text).toContain('STATUS:CONFIRMED');
    expect(text).toContain(`URL:http://localhost:3000/workshops/${ev.slug}`);
    expect(text).toContain(`UID:${ev.id}@zfadavi.com`);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // every line ends with CRLF
  });

  it('uses the Danish title and the Danish page address for Danish visitors', async () => {
    const ev = await insertEvent({ title: 'Painting', title_da: 'Maleri' });
    const text = await (await call(`/api/events/${ev.slug}/ics?lang=da`)).text();
    expect(text).toContain('SUMMARY:Maleri');
    expect(text).toContain(`URL:http://localhost:3000/da/workshops/${ev.slug}`);
  });

  it('marks a cancelled event as cancelled', async () => {
    const ev = await insertEvent({ status: 'cancelled' });
    expect(await (await call(`/api/events/${ev.slug}/ics`)).text()).toContain('STATUS:CANCELLED');
  });

  it('folds long lines at 75 bytes without splitting a Danish letter', async () => {
    const ev = await insertEvent({ title: 'Blå røde æbler på årets store maleri workshop med masser af farver og kreativitet i København' });
    const text = await (await call(`/api/events/${ev.slug}/ics`)).text();
    const enc = new TextEncoder();
    for (const line of text.split('\r\n')) expect(enc.encode(line).length, line).toBeLessThanOrEqual(75);
    expect(text.replace(/\r\n /g, '')).toContain('Blå røde æbler på årets store maleri workshop med masser af farver og kreativitet i København');
  });
});

describe('events finish by themselves', () => {
  it('a published event whose end has passed becomes completed; drafts and future events are left alone', async () => {
    const over = await insertEvent({ starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    const draftOver = await insertEvent({ status: 'draft', starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    const future = await insertEvent();
    expect(await completePastEvents(testEnv())).toBe(1);
    const status = async (id: string) => (await env.DB.prepare('SELECT status FROM events WHERE id = ?1').bind(id).first<{ status: string }>())!.status;
    expect(await status(over.id)).toBe('completed');
    expect(await status(draftOver.id)).toBe('draft');
    expect(await status(future.id)).toBe('published');
  });

  it('the 15-minute cron does it', async () => {
    const over = await insertEvent({ starts_at: '2020-05-10T08:00:00.000Z', ends_at: '2020-05-10T11:00:00.000Z' });
    await runScheduled(FREQUENT_CRON, testEnv());
    expect(((await env.DB.prepare('SELECT status FROM events WHERE id = ?1').bind(over.id).first()) as { status: string }).status).toBe('completed');
  });
});
