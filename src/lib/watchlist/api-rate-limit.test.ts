import { describe, expect, it, vi } from 'vitest';
import {
  cleanupWatchlistApiRateLimits,
  consumeWatchlistApiRateLimit,
  enforceWatchlistApiRateLimit,
} from './api-rate-limit';

describe('Watchlist API rate limits', () => {
  it('parses an allowed atomic quota result', async () => {
    const rpc = vi.fn(async () => ({
      data: { allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0 },
      error: null,
    }));
    await expect(consumeWatchlistApiRateLimit({ rpc }, 'bulk')).resolves.toMatchObject({
      allowed: true, remaining: 19,
    });
    expect(rpc).toHaveBeenCalledWith('consume_watchlist_api_rate_limit', { p_action: 'bulk' });
  });

  it('maps exhaustion to a retryable 429 with the shared error contract', async () => {
    const rpc = vi.fn(async () => ({
      data: { allowed: false, limit: 6, remaining: 0, retryAfterSeconds: 42 },
      error: null,
    }));
    const response = await enforceWatchlistApiRateLimit({ rpc }, 'import', 'request-1');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('42');
    await expect(response?.json()).resolves.toMatchObject({
      code: 'watchlist_rate_limited', requestId: 'request-1', limit: 6, remaining: 0,
    });
  });

  it('fails closed when the limiter is unavailable or malformed', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const response = await enforceWatchlistApiRateLimit({ rpc }, 'write');
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({ code: 'watchlist_rate_limit_unavailable' });
  });

  it('bounds maintenance cleanup parameters', async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }));
    await expect(cleanupWatchlistApiRateLimits({ rpc }, 999, 999_999)).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith('cleanup_watchlist_api_rate_limits', {
      p_retention_days: 30, p_limit: 5000,
    });
  });
});
