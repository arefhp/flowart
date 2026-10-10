/** Public (non-secret) configuration. Only NEXT_PUBLIC_* values reach the browser. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zfadavi.com').replace(/\/+$/, '');

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';

/** Cloudflare's published always-pass test key: no widget script is loaded, so local dev works offline. */
export const isTurnstileTestKey = (key: string) => key.startsWith('1x0000');

export const SITE_NAME = 'Zakereh Art';
export const CONTACT_EMAIL = 'info@zfadavi.com';
export const BUSINESS_LEGAL_NAME = 'Flow Art';
export const BUSINESS_CVR = '42674249';
