import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 120, remaining: 119, retryAfterSeconds: 0,
  })),
}));

import { DELETE } from './route';

const context = { params: Promise.resolve({ ticker: 'AAPL' }) };

describe('DELETE /api/watchlist/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('rejects an ambiguous cross-list delete', async () => {
    const response = await DELETE(new Request('https://example.com/api/watchlist/AAPL', { method: 'DELETE' }), context);
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('scopes the delete to the requested group', async () => {
    const filters: Array<[string, string]> = [];
    const query = {
      delete: () => query,
      eq: (column: string, value: string) => {
        filters.push([column, value]);
        return query;
      },
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    };
    mocks.from.mockReturnValue(query);
    const response = await DELETE(
      new Request('https://example.com/api/watchlist/AAPL?watchlist_id=wl-1', { method: 'DELETE' }),
      context,
    );
    expect(response.status).toBe(200);
    expect(filters).toContainEqual(['watchlist_id', 'wl-1']);
  });
});
