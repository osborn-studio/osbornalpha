import { NextResponse } from 'next/server';

interface WatchlistApiErrorOptions {
  retryable?: boolean;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  requestId?: string;
}

export function watchlistApiError(
  code: string,
  status: number,
  options: WatchlistApiErrorOptions = {},
) {
  const requestId = options.requestId ?? crypto.randomUUID();
  const retryable = options.retryable ?? (status === 429 || status === 502 || status === 503);
  const retryAfterSeconds = options.retryAfterSeconds && options.retryAfterSeconds > 0
    ? Math.floor(options.retryAfterSeconds)
    : null;
  return NextResponse.json({
    error: code,
    code,
    retryable,
    requestId,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(options.details ?? {}),
  }, {
    status,
    headers: {
      'x-request-id': requestId,
      ...(retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {}),
    },
  });
}
