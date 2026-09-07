import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), refresh: vi.fn(), owns: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/research-service', () => ({
  loadWatchlistResearchBundle: mocks.load,
}));
vi.mock('@/lib/watchlist/server-repository', () => ({ userOwnsWatchlistTicker: mocks.owns }));
vi.mock('@/lib/watchlist/research-command-service', () => ({ enqueueWatchlistResearchRefresh: mocks.refresh }));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ ticker: 'aapl' }) };
const bundle = {
  ticker: 'AAPL', news: { items: [] }, reports: { items: [] }, perspectives: [],
  perspectiveSource: null, perspectivesGeneratedAt: null, timeline: [], changes: null,
  refresh: { status: 'stored', refreshedAt: null, warnings: [] },
};
const job = {
  id: '11111111-1111-5111-8111-111111111111', user_id: 'user-1', ticker: 'AAPL',
  status: 'queued', stage: 'queued', progress: 0, attempt_count: 0, max_attempts: 3,
  quota_plan: 'free', quota_limit: 10, quota_used: 1, next_attempt_at: '2026-09-04T12:00:00Z',
  lease_expires_at: null, lease_token: null, cancel_requested_at: null, result: {}, error_code: null,
  created_at: '2026-09-04T12:00:00Z', started_at: null, finished_at: null, updated_at: '2026-09-04T12:00:00Z',
};

describe('/api/watchlist/research/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.load.mockResolvedValue(bundle);
    mocks.refresh.mockResolvedValue(job);
    mocks.owns.mockResolvedValue(true);
  });

  it('loads stored research without invoking external providers', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/research/aapl'), context);
    expect(response.status).toBe(200);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
  });

  it('enqueues an idempotent async refresh and returns its durable location', async () => {
    const response = await POST(new Request('http://localhost/api/watchlist/research/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toBe(`/api/watchlist/research/jobs/${job.id}`);
    expect(mocks.refresh).toHaveBeenCalledWith(expect.anything(), 'user-1', 'AAPL');
    expect(await response.json()).toMatchObject({ job: { id: job.id, ticker: 'AAPL', status: 'queued' } });
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
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('returns the plan limit without invoking a provider refresh', async () => {
    const { WatchlistResearchJobRepositoryError } = await import('@/lib/watchlist/research-job-repository');
    mocks.refresh.mockRejectedValueOnce(new WatchlistResearchJobRepositoryError(
      'watchlist_research_plan_limit', { used: 10, limit: 10, plan: 'free' },
    ));
    const response = await POST(new Request('http://localhost/api/watchlist/research/aapl', { method: 'POST' }), context);
    expect(response.status).toBe(429);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
