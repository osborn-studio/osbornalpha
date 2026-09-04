import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), claim: vi.fn(), audience: vi.fn(), finish: vi.fn(), fetchSources: vi.fn(), persist: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.admin }));
vi.mock('@/lib/watchlist/research-refresh-repository', () => ({
  claimWatchlistResearchTickerRefresh: mocks.claim,
  loadWatchlistResearchAudience: mocks.audience,
  finishWatchlistResearchTickerRefresh: mocks.finish,
}));
vi.mock('@/lib/watchlist/research-service', () => ({
  fetchWatchlistResearchSources: mocks.fetchSources,
  persistWatchlistResearchSnapshot: mocks.persist,
}));

import { GET } from './route';

const originalSecret = process.env.CRON_SECRET;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('GET /api/cron/watchlist-research', () => {
  it('returns 503 when CRON_SECRET is absent', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request('http://localhost/api/cron/watchlist-research'))).status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer before constructing the admin client', async () => {
    process.env.CRON_SECRET = 'secret';
    expect((await GET(new Request('http://localhost/api/cron/watchlist-research'))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('fetches each ticker once and distributes the snapshot to every follower', async () => {
    process.env.CRON_SECRET = 'secret';
    const db = { kind: 'admin' };
    const claimed = {
      ticker: 'AAPL', status: 'running', failure_count: 0, last_attempt_at: null,
      last_success_at: null, next_refresh_at: '2026-09-04T00:00:00Z', lease_expires_at: null,
      last_error: null, updated_at: '2026-09-04T00:00:00Z',
    };
    const snapshot = { ticker: 'AAPL', status: 'complete', warnings: [], news: {}, reports: {} };
    mocks.admin.mockReturnValue(db);
    mocks.claim.mockResolvedValue([claimed]);
    mocks.audience.mockResolvedValue(['user-1', 'user-2']);
    mocks.fetchSources.mockResolvedValue(snapshot);
    mocks.persist.mockResolvedValue({ status: 'complete', warnings: [] });

    const response = await GET(new Request('http://localhost/api/cron/watchlist-research', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 1, complete: 1, distributed: 2, cron_run_id: expect.any(String) });
    expect(response.headers.get('x-cron-run-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.fetchSources).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledTimes(2);
    expect(mocks.persist).toHaveBeenCalledWith(db, 'user-1', snapshot);
    expect(mocks.persist).toHaveBeenCalledWith(db, 'user-2', snapshot);
    expect(mocks.finish).toHaveBeenCalledWith(db, claimed, 'complete', null);
  });

  it('returns a traceable failure when the admin client cannot be created', async () => {
    process.env.CRON_SECRET = 'secret';
    mocks.admin.mockImplementation(() => { throw new Error('supabase_admin_unavailable'); });

    const response = await GET(new Request('http://localhost/api/cron/watchlist-research', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'watchlist_research_cron_failed',
      cron_run_id: expect.any(String),
      duration_ms: expect.any(Number),
    });
  });
});
