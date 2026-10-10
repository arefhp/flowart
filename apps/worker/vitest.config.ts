import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  // The wrangler config points at ../web/out for static assets; it only has to exist.
  mkdirSync(path.join(here, '..', 'web', 'out'), { recursive: true });
  const migrations = await readD1Migrations(path.join(here, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // local-development configuration used by tests (production is tested by overriding)
            APP_ENV: 'local',
            ADMIN_DEV_BYPASS: 'true',
            PUBLIC_SITE_URL: 'http://localhost:3000',
            MEDIA_BASE_URL: 'http://localhost:8787/media',
            EMAIL_DRIVER: 'console',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
            GITHUB_DISPATCH_TOKEN: '',
            STRIPE_FAKE: 'true',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_for_unit_tests',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.ts'],
    },
  };
});
