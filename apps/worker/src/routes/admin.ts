import { Hono, type Context } from 'hono';
import { adminBypassActive } from '../config';
import { audit } from '../lib/audit';
import { HttpError, type AppBindings } from '../lib/http';
import { noteContentChange, rebuildStatus, triggerRebuild } from '../lib/rebuild';
import { adminAuth, getCtx } from '../middleware';
import {
  aboutInput,
  artworkInput,
  categoryInput,
  coverInput,
  eventInput,
  imageAltInput,
  eventCancelInput,
  orderInput,
  parse,
  readJson,
  socialInput,
} from '../schemas';
import { getAdminAbout, removePortrait, setPortrait, updateAbout } from '../services/about';
import {
  addImage,
  createArtwork,
  deleteArtwork,
  deleteImage,
  getAdminArtwork,
  listAdminArtworks,
  reorderImages,
  setCover,
  updateArtwork,
  updateImageAlt,
} from '../services/artworks';
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  reorderCategories,
  updateCategory,
} from '../services/categories';
import {
  adminCancelBooking,
  bookingsCsv,
  cancelEvent,
  getAdminBooking,
  listAdminBookings,
  markHandled,
  processCancelledEventBookings,
} from '../services/bookings-admin';
import {
  createEvent,
  deleteEvent,
  getAdminEvent,
  listAdminEvents,
  publishEvent,
  unpublishEvent,
  updateEvent,
} from '../services/events';
import { validateUpload } from '../services/images';
import { getAdminSocial, replaceSocial } from '../services/social';

export const adminRoutes = new Hono<AppBindings>();
adminRoutes.use('*', adminAuth);

const MAX_UPLOAD_BYTES = 14 * 1024 * 1024; // three variants of up to 4 MB plus form overhead

type C = Context<AppBindings>;
const actor = (c: C) => c.get('adminEmail') ?? 'unknown';

/** Record the action and queue a rebuild of the public site. */
async function changed(c: C, action: string, entity: string, id?: string, details?: Record<string, unknown>) {
  await audit(c.env, actor(c), action, entity, id, details);
  await noteContentChange(c.env, getCtx(c));
}

async function readUpload(c: C): Promise<FormData> {
  const length = Number(c.req.header('content-length') ?? '0');
  if (length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'too_large', 'The upload is too large.');
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    throw new HttpError(400, 'invalid_upload', 'The upload could not be read.');
  }
  return form;
}

adminRoutes.get('/me', (c) => c.json({ email: actor(c), devMode: adminBypassActive(c.env) }));

// ---- events (workshops) ----
adminRoutes.get('/events', async (c) => c.json({ events: await listAdminEvents(c.env) }));

adminRoutes.post('/events', async (c) => {
  const input = parse(eventInput, await readJson(c.req.raw));
  const event = await createEvent(c.env, input);
  await changed(c, 'event.create', 'event', event.id, { title: event.title });
  return c.json(event, 201);
});

adminRoutes.get('/events/:id', async (c) => c.json(await getAdminEvent(c.env, c.req.param('id'))));

adminRoutes.put('/events/:id', async (c) => {
  const input = parse(eventInput, await readJson(c.req.raw));
  const event = await updateEvent(c.env, c.req.param('id'), input);
  await changed(c, 'event.update', 'event', event.id);
  return c.json(event);
});

adminRoutes.post('/events/:id/publish', async (c) => {
  const event = await publishEvent(c.env, c.req.param('id'));
  await changed(c, 'event.publish', 'event', event.id);
  return c.json(event);
});

adminRoutes.post('/events/:id/unpublish', async (c) => {
  const event = await unpublishEvent(c.env, c.req.param('id'));
  await changed(c, 'event.unpublish', 'event', event.id);
  return c.json(event);
});

/**
 * Cancel a workshop. With bookings, the first call answers 409 "confirmation_required" with the numbers;
 * the admin confirms and the call is repeated with { confirm: true }, which refunds and emails everyone.
 */
adminRoutes.post('/events/:id/cancel', async (c) => {
  const body = parse(eventCancelInput, await readJson(c.req.raw).catch(() => ({})));
  const result = await cancelEvent(c.env, c.req.param('id'), body.confirm === true);
  await changed(c, 'event.cancel', 'event', result.event.id, {
    bookings: result.summary.confirmedBookings,
    refunded: result.refunds.done,
    needs_attention: result.refunds.failed,
  });
  return c.json({ ...result.event, refunds: result.refunds, summary: result.summary });
});

/** Carry on refunding a cancelled workshop's bookings (the scheduled job does this too). */
adminRoutes.post('/events/:id/refunds', async (c) => {
  const refunds = await processCancelledEventBookings(c.env, { eventId: c.req.param('id') });
  await audit(c.env, actor(c), 'event.refunds', 'event', c.req.param('id'), { ...refunds });
  return c.json(refunds);
});

// ---- bookings ----
const bookingFilter = (c: C) => ({
  eventId: c.req.query('event') || undefined,
  status: c.req.query('status') || undefined,
  needsAttention: c.req.query('attention') === '1',
});

adminRoutes.get('/bookings', async (c) => c.json({ bookings: await listAdminBookings(c.env, bookingFilter(c)) }));

// Defined before the :id routes so "export.csv" is not read as a booking id.
adminRoutes.get('/bookings/export.csv', async (c) => {
  const csv = bookingsCsv(await listAdminBookings(c.env, bookingFilter(c), 2000));
  await audit(c.env, actor(c), 'booking.export', 'booking');
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bookings.csv"',
      'Cache-Control': 'no-store',
    },
  });
});

adminRoutes.get('/bookings/:id', async (c) => c.json(await getAdminBooking(c.env, c.req.param('id'))));

/** Cancel a booking; a paid one is refunded in full. */
adminRoutes.post('/bookings/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const result = await adminCancelBooking(c.env, id);
  await audit(c.env, actor(c), 'booking.cancel', 'booking', id, { outcome: result.outcome });
  return c.json({ ...(await getAdminBooking(c.env, id)), outcome: result.outcome });
});

/** The owner dealt with a flagged booking by hand (for example refunded it in Stripe). */
adminRoutes.post('/bookings/:id/handled', async (c) => {
  const booking = await markHandled(c.env, c.req.param('id'));
  await audit(c.env, actor(c), 'booking.handled', 'booking', booking.id);
  return c.json(booking);
});

adminRoutes.delete('/events/:id', async (c) => {
  const id = c.req.param('id');
  await deleteEvent(c.env, id);
  await changed(c, 'event.delete', 'event', id);
  return c.json({ ok: true });
});

// ---- categories ----
adminRoutes.get('/categories', async (c) => c.json({ categories: await listAdminCategories(c.env) }));

adminRoutes.post('/categories', async (c) => {
  const input = parse(categoryInput, await readJson(c.req.raw));
  const category = await createCategory(c.env, input);
  await changed(c, 'category.create', 'category', category.id, { name: category.name });
  return c.json(category, 201);
});

// Defined before the :id routes so "order" is not read as a category id.
adminRoutes.patch('/categories/order', async (c) => {
  const { ids } = parse(orderInput, await readJson(c.req.raw));
  const categories = await reorderCategories(c.env, ids);
  await changed(c, 'category.order', 'category');
  return c.json({ categories });
});

adminRoutes.put('/categories/:id', async (c) => {
  const input = parse(categoryInput, await readJson(c.req.raw));
  const category = await updateCategory(c.env, c.req.param('id'), input);
  await changed(c, 'category.update', 'category', category.id, { name: category.name });
  return c.json(category);
});

adminRoutes.delete('/categories/:id', async (c) => {
  const id = c.req.param('id');
  await deleteCategory(c.env, id);
  await changed(c, 'category.delete', 'category', id);
  return c.json({ ok: true });
});

// ---- artworks ----
adminRoutes.get('/artworks', async (c) => c.json({ artworks: await listAdminArtworks(c.env) }));

adminRoutes.post('/artworks', async (c) => {
  const input = parse(artworkInput, await readJson(c.req.raw));
  const artwork = await createArtwork(c.env, input);
  await changed(c, 'artwork.create', 'artwork', artwork.id, { title: artwork.title });
  return c.json(artwork, 201);
});

adminRoutes.get('/artworks/:id', async (c) => c.json(await getAdminArtwork(c.env, c.req.param('id'))));

adminRoutes.put('/artworks/:id', async (c) => {
  const input = parse(artworkInput, await readJson(c.req.raw));
  const artwork = await updateArtwork(c.env, c.req.param('id'), input);
  await changed(c, 'artwork.update', 'artwork', artwork.id);
  return c.json(artwork);
});

adminRoutes.delete('/artworks/:id', async (c) => {
  const id = c.req.param('id');
  await deleteArtwork(c.env, actor(c), id);
  await changed(c, 'artwork.delete', 'artwork', id);
  return c.json({ ok: true });
});

adminRoutes.put('/artworks/:id/cover', async (c) => {
  const { imageId } = parse(coverInput, await readJson(c.req.raw));
  const artwork = await setCover(c.env, c.req.param('id'), imageId);
  await changed(c, 'artwork.cover', 'artwork', artwork.id);
  return c.json(artwork);
});

// ---- artwork images ----
adminRoutes.post('/artworks/:id/images', async (c) => {
  const form = await readUpload(c);
  const upload = await validateUpload(form);
  const alt = parse(imageAltInput, {
    alt_text: String(form.get('alt_text') ?? ''),
    alt_text_da: form.get('alt_text_da') ? String(form.get('alt_text_da')) : null,
  });
  const artwork = await addImage(c.env, c.req.param('id'), upload, alt);
  await changed(c, 'artwork.image.add', 'artwork', artwork.id);
  return c.json(artwork, 201);
});

// Defined before the :imageId routes so "order" is not read as an image id.
adminRoutes.patch('/artworks/:id/images/order', async (c) => {
  const { ids } = parse(orderInput, await readJson(c.req.raw));
  const artwork = await reorderImages(c.env, c.req.param('id'), ids);
  await changed(c, 'artwork.image.order', 'artwork', artwork.id);
  return c.json(artwork);
});

adminRoutes.patch('/artworks/:id/images/:imageId', async (c) => {
  const alt = parse(imageAltInput, await readJson(c.req.raw));
  const artwork = await updateImageAlt(c.env, c.req.param('id'), c.req.param('imageId'), alt);
  await changed(c, 'artwork.image.alt', 'artwork', artwork.id);
  return c.json(artwork);
});

adminRoutes.delete('/artworks/:id/images/:imageId', async (c) => {
  const artwork = await deleteImage(c.env, actor(c), c.req.param('id'), c.req.param('imageId'));
  await changed(c, 'artwork.image.delete', 'artwork', artwork.id);
  return c.json(artwork);
});

// ---- about ----
adminRoutes.get('/about', async (c) => c.json(await getAdminAbout(c.env)));

adminRoutes.put('/about', async (c) => {
  const input = parse(aboutInput, await readJson(c.req.raw));
  const about = await updateAbout(c.env, input);
  await changed(c, 'about.update', 'about');
  return c.json(about);
});

adminRoutes.post('/about/portrait', async (c) => {
  const form = await readUpload(c);
  const upload = await validateUpload(form);
  const about = await setPortrait(c.env, actor(c), upload, {
    alt: String(form.get('portrait_alt') ?? ''),
    alt_da: form.get('portrait_alt_da') ? String(form.get('portrait_alt_da')).trim() || null : null,
  });
  await changed(c, 'about.portrait.set', 'about');
  return c.json(about, 201);
});

adminRoutes.delete('/about/portrait', async (c) => {
  const about = await removePortrait(c.env, actor(c));
  await changed(c, 'about.portrait.remove', 'about');
  return c.json(about);
});

// ---- social links ----
adminRoutes.get('/social', async (c) => c.json(await getAdminSocial(c.env)));

adminRoutes.put('/social', async (c) => {
  const { links } = parse(socialInput, await readJson(c.req.raw));
  const result = await replaceSocial(c.env, links);
  await changed(c, 'social.update', 'social', undefined, { count: result.links.length });
  return c.json(result);
});

// ---- messages ----
adminRoutes.get('/messages', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.email, m.message, m.locale, m.created_at, a.title AS artwork_title, a.slug AS artwork_slug
       FROM contact_messages m LEFT JOIN artworks a ON a.id = m.artwork_id
      ORDER BY m.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ messages: rows.results });
});

// ---- site rebuild ----
adminRoutes.get('/site/status', async (c) => c.json(await rebuildStatus(c.env)));

adminRoutes.post('/site/rebuild', async (c) => {
  const outcome = await triggerRebuild(c.env, { force: true });
  await audit(c.env, actor(c), 'site.rebuild', 'site', undefined, { outcome });
  return c.json({ outcome, status: await rebuildStatus(c.env) });
});
