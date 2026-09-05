export interface WatchlistApiErrorEnvelope {
  error?: string;
  code?: string;
  errorCode?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
  [key: string]: unknown;
}

export class WatchlistRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  readonly body: WatchlistApiErrorEnvelope | null;

  constructor(
    fallbackCode: string,
    status: number,
    body: WatchlistApiErrorEnvelope | null,
  ) {
    const code = typeof body?.code === 'string'
      ? body.code
      : typeof body?.errorCode === 'string' ? body.errorCode
      : typeof body?.error === 'string' ? body.error : fallbackCode;
    super(code);
    this.name = 'WatchlistRequestError';
    this.code = code;
    this.status = status;
    this.retryable = body?.retryable === true;
    this.retryAfterSeconds = Number.isFinite(body?.retryAfterSeconds)
      ? Math.max(0, Math.floor(Number(body?.retryAfterSeconds)))
      : null;
    this.requestId = typeof body?.requestId === 'string' ? body.requestId : null;
    this.body = body;
  }
}

function errorEnvelope(value: unknown): WatchlistApiErrorEnvelope | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as WatchlistApiErrorEnvelope
    : null;
}

export async function watchlistJsonRequest<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackCode: string,
): Promise<T> {
  const response = await watchlistResponseRequest(input, init, fallbackCode);
  return await response.json().catch(() => null) as T;
}

export async function watchlistResponseRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackCode: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new WatchlistRequestError(fallbackCode, 0, null);
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as unknown;
    throw new WatchlistRequestError(fallbackCode, response.status, errorEnvelope(body));
  }
  return response;
}

export type WatchlistJsonResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; body: WatchlistApiErrorEnvelope | null; error: WatchlistRequestError };

export async function watchlistJsonResult<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackCode: string,
): Promise<WatchlistJsonResult<T>> {
  try {
    const response = await watchlistResponseRequest(input, init, fallbackCode);
    return {
      ok: true,
      status: response.status,
      body: await response.json().catch(() => null) as T,
    };
  } catch (error) {
    if (!(error instanceof WatchlistRequestError)) throw error;
    return { ok: false, status: error.status, body: error.body, error };
  }
}

export function watchlistRequestErrorCode(error: unknown, fallbackCode: string): string {
  return error instanceof WatchlistRequestError ? error.code : fallbackCode;
}
