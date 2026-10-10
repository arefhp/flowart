/**
 * Browser-side admin API client. Same origin (/api/admin/*). State-changing requests carry the
 * `X-Admin-Request: 1` header, and the browser adds `Origin`, which together are the CSRF defence
 * (spec section 8). The Cloudflare Access cookie is the credential; no token is handled here.
 */
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Raised when the Access session has ended; the shell shows "reload to sign in again". */
export const SESSION_ENDED_EVENT = 'admin-session-ended';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET') headers.set('X-Admin-Request', '1');
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    // `redirect: 'manual'`: an expired Access session answers with a redirect to the login page.
    res = await fetch(`/api/admin${path}`, { ...init, method, headers, credentials: 'same-origin', redirect: 'manual' });
  } catch {
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    throw new AdminApiError(0, 'network', 'Could not reach the server. Check your connection and reload the page.');
  }
  if (res.type === 'opaqueredirect' || res.status === 401) {
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    throw new AdminApiError(401, 'unauthorized', 'Your session ended. Reload the page to sign in again.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } } } | null)?.error;
    throw new AdminApiError(res.status, err?.code ?? 'error', err?.message ?? `The server answered ${res.status}.`, err?.details?.fields);
  }
  return data as T;
}

export const adminApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

// ---------------------------------------------------------------------------- types

export interface AdminImage {
  id: string;
  url: string;
  alt_text: string;
  alt_text_da: string | null;
  sort_order: number;
  width: number;
  height: number;
  is_cover: boolean;
}

export interface AdminArtwork {
  id: string;
  slug: string;
  title: string;
  title_da: string | null;
  description: string | null;
  description_da: string | null;
  price_minor: number | null;
  currency: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  medium: string | null;
  medium_da: string | null;
  year: number | null;
  status: 'available' | 'reserved' | 'sold' | 'hidden';
  featured: boolean;
  cover_image_id: string | null;
  images: AdminImage[];
  updated_at: string;
}

export interface AdminArtworkRow {
  id: string;
  slug: string;
  title: string;
  status: AdminArtwork['status'];
  featured: boolean;
  price_minor: number | null;
  currency: string | null;
  image_count: number;
  cover: { url: string; width: number; height: number } | null;
  updated_at: string;
}

export interface RebuildStatus {
  state: 'pending' | 'done' | 'failed' | 'skipped';
  message: string;
  contentUpdatedAt: string | null;
  lastTriggeredAt: string | null;
}
