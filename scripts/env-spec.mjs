// Shared by setup.mjs and check-env.mjs: how to read the two env files and what each variable is for.
// Prints variable NAMES only, never values.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WORKER_VARS = join(root, 'apps', 'worker', '.dev.vars');
export const WORKER_EXAMPLE = join(root, 'apps', 'worker', '.dev.vars.example');
export const WEB_ENV = join(root, 'apps', 'web', '.env.local');
export const WEB_EXAMPLE = join(root, 'apps', 'web', '.env.local.example');

export function parseEnvFile(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Empty, or still an obvious example (CHANGE_ME, re_xxx, sk_test_xxx ...). */
export function isPlaceholder(value) {
  const v = (value ?? '').trim();
  return v === '' || /change[_-]?me/i.test(v) || /_x{3,}$/i.test(v) || /^x{3,}$/i.test(v);
}

/**
 * What is needed for what. `boot` variables must be set for the site to start; `feature` groups
 * only matter when you want to try that feature (the site still boots without them).
 */
export const CHECKS = {
  worker: {
    file: 'apps/worker/.dev.vars',
    boot: [
      'APP_ENV',
      'PUBLIC_SITE_URL',
      'MEDIA_BASE_URL',
      'ADMIN_DEV_BYPASS',
      'EMAIL_DRIVER',
      'EMAIL_FROM_ADDRESS',
      'EMAIL_FROM_NAME',
      'OWNER_NOTIFICATION_EMAIL',
      'TURNSTILE_SECRET_KEY',
    ],
    features: [
      {
        name: 'real email sending (EMAIL_DRIVER=resend)',
        when: (env) => env.EMAIL_DRIVER === 'resend',
        vars: ['RESEND_API_KEY'],
        hint: 'https://resend.com/api-keys (Sending access). Until set, emails print in the terminal.',
      },
      {
        name: 'automatic site rebuild after admin saves',
        when: () => false, // optional locally: without it the admin shows "Rebuild skipped (local)"
        vars: ['GITHUB_DISPATCH_TOKEN'],
        hint: 'Production only. Locally the rebuild is skipped and the admin says so.',
      },
      {
        name: 'payments (Stripe sandbox)',
        when: () => false,
        vars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
        hint: 'Optional locally: without them a built-in pretend payment page is used (STRIPE_FAKE=true). Set both to test with the real Stripe sandbox (the whsec_ value is printed by "stripe listen"). Required in production.',
      },
    ],
  },
  web: {
    file: 'apps/web/.env.local',
    boot: ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'BUILD_API_BASE_URL'],
    features: [],
  },
};
