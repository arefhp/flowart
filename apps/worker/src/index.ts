import { createApp } from './app';
import type { Env } from './env';
import { runScheduled } from './scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller.cron, env));
  },
} satisfies ExportedHandler<Env>;

export { app };
