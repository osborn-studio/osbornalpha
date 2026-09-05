import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  load: vi.fn(),
  markSeen: vi.fn(),
  owns: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/activity-service', () => ({ loadWatchlistActivityBundle: mocks.load }));
vi.mock('@/lib/watchlist/activity-repository', () => ({ markWatchlistActivitySeen: mocks.markSeen }));
vi.mock('@/lib/watchlist/server-repository', () => ({ userOwnsWatchlistTicker: mocks.owns }));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ ticker: 'aapl' }) };

describe('/api/watchlist/activity/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.owns.mockResolvedValue(true);
    mocks.load.mockResolvedValue({ ticker: 'AAPL', activity: { unseenCount: 0 }, timeline: [] });
    mocks.markSeen.mockResolvedValue({ last_seen_at: '2026-09-04T12:00:00.000Z' });
  });

  it('loads the normalized user-scoped activity bundle', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/activity/aapl'), context);
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
    await expect(response.json()).resolves.toMatchObject({ ticker: 'AAPL' });
  });

  it('fails closed before loading activity without a session', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request('http://localhost/api/watchlist/activity/aapl'), context);
    expect(response.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('maps an absent watchlist item to a non-enumerable 404', async () => {
    mocks.load.mockRejectedValue(new Error('watchlist_item_not_found'));
    const response = await GET(new Request('http://localhost/api/watchlist/activity/aapl'), context);
    expect(response.status).toBe(404);
  });

  it('marks activity read only after verifying watchlist ownership', async () => {
    const response = await POST(new Request('http://localhost/api/watchlist/activity/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(200);
    expect(mocks.owns).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
    expect(mocks.markSeen).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
    await expect(response.json()).resolves.toEqual({ lastSeenAt: '2026-09-04T12:00:00.000Z' });
  });

  it('does not write read state for a ticker outside the user watchlist', async () => {
    mocks.owns.mockResolvedValue(false);
    const response = await POST(new Request('http://localhost/api/watchlist/activity/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(404);
    expect(mocks.markSeen).not.toHaveBeenCalled();
  });
});
