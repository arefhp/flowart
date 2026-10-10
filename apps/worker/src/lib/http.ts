import type { Env } from '../env';

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
    adminEmail?: string;
  };
};

/** An error that becomes the consistent JSON error shape `{ error: { code, message } }`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'unauthorized', message);

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

/** Strip control characters (CR/LF included) so a value is safe in an email header or log line. */
export function stripControl(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
