import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), refresh: vi.fn(), owns: vi.fn(), authorize: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: vi.fn(() => ({ kind: 'admin' })) }));
vi.mock('@/lib/watchlist/research-service', () => ({
  loadWatchlistResearchBundle: mocks.load,
  refreshWatchlistResearch: mocks.refresh,
}));
vi.mock('@/lib/watchlist/server-repository', () => ({ userOwnsWatchlistTicker: mocks.owns }));
vi.mock('@/lib/watchlist/research-quota', () => ({ authorizeResearchRefresh: mocks.authorize }));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ ticker: 'aapl' }) };
const bundle = {
  ticker: 'AAPL', news: { items: [] }, reports: { items: [] }, perspectives: [],
  perspectiveSource: null, perspectivesGeneratedAt: null, timeline: [], changes: null,
  refresh: { status: 'stored', refreshedAt: null, warnings: [] },
};

describe('/api/watchlist/research/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.load.mockResolvedValue(bundle);
    mocks.refresh.mockResolvedValue({ status: 'complete', refreshedAt: '2026-09-04T12:00:00Z', warnings: [] });
    mocks.owns.mockResolvedValue(true);
    mocks.authorize.mockResolvedValue({ allowed: true, plan: { allowed: true, used: 1, limit: 10, plan: 'free' } });
  });

  it('loads stored research without invoking external providers', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/research/aapl'), context);
    expect(response.status).toBe(200);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
  });

  it('refreshes explicitly and then returns the canonical stored bundle', async () => {
    const response = await POST(new Request('http://localhost/api/watchlist/research/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledWith({ kind: 'admin' }, 'user-1', 'AAPL');
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      refresh: { status: 'complete' },
      changes: { hasChanges: false, newNews: 0, newReports: 0, perspectivesChanged: false },
    });
  });

  it('fails closed before reading stored research without a session', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request('http://localhost/api/watchlist/research/aapl'), context);
    expect(response.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('does not spend research quota for a ticker outside the user watchlist', async () => {
    mocks.owns.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost/api/watchlist/research/aapl'), context);
    expect(response.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it('returns the plan limit without invoking a provider refresh', async () => {
    mocks.authorize.mockResolvedValueOnce({
      allowed: false,
      reason: 'plan_limit',
      plan: { allowed: false, used: 10, limit: 10, plan: 'free' },
    });
    const response = await POST(new Request('http://localhost/api/watchlist/research/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(429);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
