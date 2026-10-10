import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real local stack: the Worker (wrangler dev, local D1 and R2)
 * and the Next dev server, seeded with `npm run seed`. They create their own data and clean up.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // forces the pretend payment page, even when a real Stripe test key sits in .dev.vars
      command: 'npm run dev:e2e -w apps/worker',
      cwd: '../..',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web',
      cwd: '../..',
      // the always-pass spam-check key, even when a real one is set in .env.local
      env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
