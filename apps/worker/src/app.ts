import { Hono } from 'hono';
import { isLocal } from './config';
import { errorBody, HttpError, notFound, type AppBindings } from './lib/http';
import { configGuard, requestContext } from './middleware';
import { adminRoutes } from './routes/admin';
import { bookingRoutes } from './routes/booking-routes';
import { publicRoutes } from './routes/public';

/** Keys the local media route will serve: server-generated artwork and About variants only. */
const MEDIA_KEY = /^(artworks|site)\/[A-Za-z0-9/_-]+-(480|960|1920)\.webp$/;

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use('*', requestContext);
  app.use('/api/*', configGuard);

  app.route('/api', publicRoutes);
  app.route('/api', bookingRoutes);
  app.route('/api/admin', adminRoutes);

  /**
   * Local development only: serve images from the local R2 emulation, the stand-in for
   * media.zfadavi.com. In production this answers 404 and nothing is served from here.
   */
  app.get('/media/*', async (c) => {
    if (!isLocal(c.env)) throw notFound();
    const key = decodeURIComponent(new URL(c.req.url).pathname.slice('/media/'.length));
    if (!MEDIA_KEY.test(key)) throw notFound();
    const object = await c.env.MEDIA.get(key);
    if (!object) throw notFound();
    return new Response(object.body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=3600',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  });

  app.notFound((c) => c.json(errorBody('not_found', 'Not found'), 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status as 400);
    }
    console.log(
      JSON.stringify({ level: 'error', msg: 'unhandled error', request_id: c.get('requestId'), error: String(err) }),
    );
    return c.json(errorBody('internal_error', 'Something went wrong. Please try again.'), 500);
  });

  return app;
}
