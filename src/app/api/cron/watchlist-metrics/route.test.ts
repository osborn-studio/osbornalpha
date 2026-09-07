import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  refresh: vi.fn(),
  composition: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.admin }));
vi.mock('@/lib/watchlist/metric-snapshot-repository', () => ({
  claimWatchlistMetricRefresh: mocks.claim,
  finishWatchlistMetricRefresh: mocks.finish,
}));
vi.mock('@/lib/watchlist/metric-snapshot-service', () => ({
  refreshWatchlistMetricSnapshot: mocks.refresh,
}));
vi.mock('@/lib/watchlist/composition-snapshot-repository', () => ({
  refreshWatchlistCompositionSnapshots: mocks.composition,
}));

import { GET } from './route';

const claimed = {
  ticker: 'AAPL', market: 'US', history_range: '1y', benchmark_ticker: 'SPY',
  status: 'running', failure_count: 0, last_attempt_at: null, last_success_at: null,
  next_refresh_at: '2026-09-04T00:00:00.000Z', lease_expires_at: null, last_error: null,
  updated_at: '2026-09-04T00:00:00.000Z',
};

describe('GET /api/cron/watchlist-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
    mocks.admin.mockReturnValue({ kind: 'admin' });
    mocks.claim.mockResolvedValue([claimed]);
    mocks.refresh.mockResolvedValue(undefined);
    mocks.finish.mockResolvedValue(undefined);
    mocks.composition.mockResolvedValue(2);
  });

  it('fails closed before constructing an admin client', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(new Request('https://example.test/api/cron/watchlist-metrics'));
    expect(response.status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer', async () => {
    const response = await GET(new Request('https://example.test/api/cron/watchlist-metrics', {
      headers: { authorization: 'Bearer wrong' },
    }));
    expect(response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('refreshes claimed rows and records successful completion', async () => {
    const response = await GET(new Request('https://example.test/api/cron/watchlist-metrics', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, claimed: 1, succeeded: 1, failed: 0, composition_refreshed: 2, composition_failed: false,
    });
    expect(mocks.refresh).toHaveBeenCalledWith(
      { kind: 'admin' }, claimed, undefined, expect.any(Date), expect.objectContaining({ getOverride: expect.any(Function) }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(
      { kind: 'admin' }, claimed, 'succeeded', null, expect.any(Date), expect.objectContaining({ getOverride: expect.any(Function) }),
    );
  });

  it('records a failed attempt without surfacing provider details', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('provider secret response'));
    const response = await GET(new Request('https://example.test/api/cron/watchlist-metrics', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 });
    expect(mocks.finish).toHaveBeenCalledWith(
      { kind: 'admin' }, claimed, 'failed', 'provider secret response', expect.any(Date), expect.objectContaining({ getOverride: expect.any(Function) }),
    );
  });
});
