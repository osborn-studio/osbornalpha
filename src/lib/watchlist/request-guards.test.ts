import { describe, expect, it, vi } from 'vitest';
import { createWatchlistRequestReporter } from './request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from './request-guards';

const authMocks = vi.hoisted(() => ({ configured: vi.fn(() => true), getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: authMocks.configured,
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: authMocks.getUser } })),
}));

describe('Watchlist request guards', () => {
  it('returns a traced authenticated context', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    authMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    try {
      const reporter = createWatchlistRequestReporter('test', { method: 'PATCH' }, 'request-auth');
      await expect(authorizeWatchlistRequest(reporter)).resolves.toMatchObject({ user: { id: 'user-1' } });
    } finally {
      info.mockRestore();
    }
  });
  it('returns no response for an allowed action', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const rpc = vi.fn(async () => ({
        data: { allowed: true, limit: 30, remaining: 29, retryAfterSeconds: 0 }, error: null,
      }));
      const reporter = createWatchlistRequestReporter('test', { method: 'POST' }, 'request-1');
      await expect(enforceReportedWatchlistRateLimit(reporter, { rpc }, 'alert')).resolves.toBeNull();
    } finally {
      info.mockRestore();
    }
  });

  it('returns a traced 429 for an exhausted action', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rpc = vi.fn(async () => ({
        data: { allowed: false, limit: 6, remaining: 0, retryAfterSeconds: 30 }, error: null,
      }));
      const reporter = createWatchlistRequestReporter('test', { method: 'POST' }, 'request-2');
      const response = await enforceReportedWatchlistRateLimit(reporter, { rpc }, 'import');
      expect(response?.status).toBe(429);
      expect(response?.headers.get('x-request-id')).toBe('request-2');
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
