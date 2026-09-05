import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/server-repository', () => ({ loadWatchlistReviewQueue: mocks.load }));

import { GET } from './route';

describe('GET /api/watchlist/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.load.mockResolvedValue({
      generatedAt: '2026-09-04T12:00:00Z', timezone: 'UTC', horizonDays: 7,
      summary: { overdue: 1, dueToday: 0, upcoming: 0, unscheduled: 0 }, rows: [],
    });
  });

  it('returns the authenticated review read model', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/reviews?scope=due'));
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), { scope: 'due', horizonDays: 7, limit: 50 });
    expect(await response.json()).toMatchObject({ summary: { overdue: 1 } });
  });

  it('rejects invalid filters before storage access', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/reviews?horizonDays=100'));
    expect(response.status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null } });
    expect((await GET(new Request('https://example.test/api/watchlist/reviews'))).status).toBe(401);
  });
});
