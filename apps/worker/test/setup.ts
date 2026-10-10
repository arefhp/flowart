import { applyD1Migrations, reset } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';
import { clearJwksCache } from '../src/lib/access';

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
    }
  }
}

// Every test starts from a freshly migrated database and empty R2 buckets.
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  clearJwksCache();
});
