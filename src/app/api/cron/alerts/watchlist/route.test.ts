import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), record: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: vi.fn(() => ({ rpc: mocks.rpc, from: vi.fn() })),
}));
vi.mock('@/lib/observability/service', () => ({ recordAndDeliverCheck: mocks.record }));

import { GET } from './route';

const snapshot = {
  generated_at: '2026-09-04T12:00:00Z',
  research_queue: { due: 0, failed: 0, oldest_due_at: null },
  metric_queue: { due: 0, failed: 0, oldest_due_at: null },
  perspective_generation_queue: {
    queued: 0, running: 0, failed: 0, oldest_queued_at: null, oldest_running_at: null,
  },
  quotes: { count: 1, latest_observed_at: '2026-09-04T11:59:00Z' },
  metrics: { count: 1, latest_observed_at: '2026-09-04T11:55:00Z' },
  alerts: { latest_finished_at: '2026-09-04T11:50:00Z', latest_status: 'succeeded', pending: 0, failed: 0, dead_letter: 0, oldest_pending_at: null },
  citations: { sample_size: 1, average_coverage: 0.8 },
  shared_research: { artifacts: 1, links: 1 },
  perspective_evaluations: { pending: 0, dead_letter: 0, oldest_due_at: null },
};

describe('/api/cron/alerts/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    mocks.record.mockResolvedValue({ ok: true, status: 'healthy' });
  });

  it('records a validated Watchlist health window', async () => {
    const response = await GET(new Request('http://localhost/api/cron/alerts/watchlist', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_watchlist_operational_health');
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      checkName: 'watchlist_15m', violations: [],
    }));
  });

  it('rejects an invalid cron credential before touching storage', async () => {
    const response = await GET(new Request('http://localhost/api/cron/alerts/watchlist', {
      headers: { authorization: 'Bearer wrong' },
    }));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails when the database returns an invalid health contract', async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    const response = await GET(new Request('http://localhost/api/cron/alerts/watchlist', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(500);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
