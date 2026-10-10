/** Bindings and variables the Worker reads. Keep in sync with .dev.vars.example (a test checks it). */
export interface AppEnv {
  // bindings
  DB: D1Database;
  MEDIA: R2Bucket;
  PRIVATE: R2Bucket;
  ASSETS: Fetcher;

  // App
  APP_ENV: string; // 'local' | 'production'
  PUBLIC_SITE_URL: string;
  MEDIA_BASE_URL: string;
  CONTACT_RETENTION_MONTHS?: string;

  // Admin / Access
  ADMIN_DEV_BYPASS?: string;
  ADMIN_EMAILS?: string;
  ACCESS_TEAM_NAME?: string;
  ACCESS_AUD?: string;

  // Email
  EMAIL_DRIVER: string; // 'console' | 'resend'
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  EMAIL_REPLY_TO?: string;
  OWNER_NOTIFICATION_EMAIL: string;
  RESEND_API_KEY?: string;

  // Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // Rebuild (GitHub repository_dispatch)
  GITHUB_REPO?: string;
  GITHUB_DISPATCH_TOKEN?: string;

  // Booking
  BOOKING_MAX_PARTICIPANTS?: string;
  BOOKING_HOLD_MINUTES?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** 'true' = local-only fake Stripe (no account needed). Ignored when a real key is set; refused in production. */
  STRIPE_FAKE?: string;
}

export type Env = AppEnv;

declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging needs an empty extension
    interface Env extends AppEnv {}
  }
}
