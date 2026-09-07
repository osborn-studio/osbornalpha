import { watchlistApiError } from './api-error';

export type WatchlistApiRateLimitAction = 'write' | 'bulk' | 'import' | 'alert' | 'feedback';

export interface WatchlistApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitDatabase {
  rpc(name: 'consume_watchlist_api_rate_limit', args: { p_action: WatchlistApiRateLimitAction }): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

function parseRateLimitResult(value: unknown): WatchlistApiRateLimitResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const limit = Number(row.limit);
  const remaining = Number(row.remaining);
  const retryAfterSeconds = Number(row.retryAfterSeconds);
  if (typeof row.allowed !== 'boolean'
    || !Number.isSafeInteger(limit) || limit < 1
    || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > limit
    || !Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 0
    || (row.allowed && retryAfterSeconds !== 0)
    || (!row.allowed && retryAfterSeconds < 1)) return null;
  return { allowed: row.allowed, limit, remaining, retryAfterSeconds };
}

export async function consumeWatchlistApiRateLimit(
  db: object,
  action: WatchlistApiRateLimitAction,
): Promise<WatchlistApiRateLimitResult> {
  const { data, error } = await (db as RateLimitDatabase).rpc('consume_watchlist_api_rate_limit', {
    p_action: action,
  });
  if (error) throw new Error(`watchlist_rate_limit_unavailable:${error.message}`);
  const result = parseRateLimitResult(data);
  if (!result) throw new Error('watchlist_rate_limit_response_invalid');
  return result;
}

export async function enforceWatchlistApiRateLimit(
  db: object,
  action: WatchlistApiRateLimitAction,
  requestId?: string,
): Promise<Response | null> {
  try {
    const result = await consumeWatchlistApiRateLimit(db, action);
    if (result.allowed) return null;
    return watchlistApiError('watchlist_rate_limited', 429, {
      requestId,
      retryAfterSeconds: result.retryAfterSeconds,
      details: { limit: result.limit, remaining: result.remaining },
    });
  } catch {
    return watchlistApiError('watchlist_rate_limit_unavailable', 503, {
      requestId,
      retryAfterSeconds: 5,
    });
  }
}

export async function cleanupWatchlistApiRateLimits(
  db: object,
  retentionDays: number,
  limit: number,
): Promise<number> {
  const repository = db as unknown as {
    rpc(name: 'cleanup_watchlist_api_rate_limits', args: {
      p_retention_days: number;
      p_limit: number;
    }): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('cleanup_watchlist_api_rate_limits', {
    p_retention_days: Math.min(Math.max(Math.floor(retentionDays), 1), 30),
    p_limit: Math.min(Math.max(Math.floor(limit), 0), 5_000),
  });
  if (error) throw new Error(`watchlist_rate_limit_cleanup_failed:${error.message}`);
  const count = Number(data);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('watchlist_rate_limit_cleanup_invalid');
  return count;
}
