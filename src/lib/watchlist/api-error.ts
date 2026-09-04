import { NextResponse } from 'next/server';

interface WatchlistApiErrorOptions {
  retryable?: boolean;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
}

export function watchlistApiError(
  code: string,
  status: number,
  options: WatchlistApiErrorOptions = {},
) {
  const retryable = options.retryable ?? (status === 429 || status === 502 || status === 503);
  const retryAfterSeconds = options.retryAfterSeconds && options.retryAfterSeconds > 0
    ? Math.floor(options.retryAfterSeconds)
    : null;
  return NextResponse.json({
    error: code,
    code,
    retryable,
    requestId: crypto.randomUUID(),
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(options.details ?? {}),
  }, {
    status,
    headers: retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : undefined,
  });
}
