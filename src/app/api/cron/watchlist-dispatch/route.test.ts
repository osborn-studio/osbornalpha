import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  run: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
}));
vi.mock('@/lib/watchlist/cron-schedule', () => ({ scheduledWatchlistCronJobs: mocks.schedule }));
vi.mock('@/lib/watchlist/cron-jobs', () => ({ runWatchlistCronJob: mocks.run }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({}) }));
vi.mock('@/lib/watchlist/cron-dispatch-repository', () => ({
  claimWatchlistCronDispatchSlots: mocks.claim,
  finishWatchlistCronDispatchSlot: mocks.finish,
}));

import { GET } from './route';

function request(secret = 'secret') {
  return new Request('https://example.test/api/cron/watchlist-dispatch', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('GET /api/cron/watchlist-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
    mocks.claim.mockResolvedValue([{
      scheduledFor: '2026-09-05T12:15:00.000Z',
      leaseToken: '10000000-0000-4000-8000-000000000001',
      attemptCount: 1,
    }]);
    mocks.finish.mockResolvedValue(undefined);
    mocks.schedule.mockReturnValue(['quote-alerts', 'operational-health']);
    mocks.run.mockResolvedValue({ ok: true });
  });

  it('fails closed before scheduling jobs', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(503);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('runs the due registry with bounded concurrency and trace metadata', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-cron-run-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      ok: true, scheduled_slots: 1, failed_slots: 0, scheduled: 2, succeeded: 2, failed: 0,
    });
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      scheduledFor: '2026-09-05T12:15:00.000Z',
    }), 'succeeded', null);
  });

  it('returns a retryable failure without hiding successful sibling jobs', async () => {
    mocks.run.mockImplementation(async (id) => {
      if (id === 'operational-health') throw new Error('health_source_unavailable:secret details');
      return { ok: true };
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('x-cron-run-id')).toMatch(/^[0-9a-f-]{36}$/);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'watchlist_dispatch_incomplete', scheduled: 2, succeeded: 1, failed: 1 });
    expect(body.results).toContainEqual(expect.objectContaining({
      id: 'operational-health', status: 'failed', error_code: 'health_source_unavailable',
    }));
  });

  it('refreshes metric snapshots before evaluating metric alerts', async () => {
    mocks.schedule.mockReturnValue(['metric-refresh', 'metric-alerts', 'quote-alerts']);
    const order: string[] = [];
    mocks.run.mockImplementation(async (id) => {
      order.push(id);
      return { ok: true };
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(order.indexOf('metric-refresh')).toBeLessThan(order.indexOf('metric-alerts'));
  });

  it('does not evaluate metric alerts when their snapshot refresh fails', async () => {
    mocks.schedule.mockReturnValue(['metric-refresh', 'metric-alerts']);
    mocks.run.mockImplementation(async (id) => ({ ok: id !== 'metric-refresh' }));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(body.results).toContainEqual(expect.objectContaining({
      id: 'metric-alerts', status: 'skipped_dependency',
    }));
  });

  it('fails a job that exceeds its independent timeout', async () => {
    vi.useFakeTimers();
    vi.stubEnv('WATCHLIST_DISPATCH_JOB_TIMEOUT_MS', '1000');
    mocks.schedule.mockReturnValue(['quote-alerts']);
    mocks.run.mockImplementation(() => new Promise(() => {}));
    try {
      const pending = GET(request());
      await vi.advanceTimersByTimeAsync(1001);
      const response = await pending;
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        results: [expect.objectContaining({
          id: 'quote-alerts', status: 'failed', error_code: 'watchlist_cron_job_timeout',
        })],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses missed slots into one deduplicated job plan', async () => {
    mocks.claim.mockResolvedValue([
      { scheduledFor: '2026-09-05T11:45:00.000Z', leaseToken: '10000000-0000-4000-8000-000000000001', attemptCount: 1 },
      { scheduledFor: '2026-09-05T12:00:00.000Z', leaseToken: '10000000-0000-4000-8000-000000000002', attemptCount: 1 },
      { scheduledFor: '2026-09-05T12:15:00.000Z', leaseToken: '10000000-0000-4000-8000-000000000003', attemptCount: 1 },
    ]);
    mocks.schedule
      .mockReturnValueOnce(['quote-alerts', 'research-refresh'])
      .mockReturnValueOnce(['quote-alerts', 'provider-health'])
      .mockReturnValueOnce(['quote-alerts', 'metric-refresh', 'metric-alerts']);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ scheduled_slots: 3, scheduled: 5, succeeded: 5 });
    expect(mocks.run.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([
      'quote-alerts', 'research-refresh', 'provider-health', 'metric-refresh', 'metric-alerts',
    ]));
    expect(mocks.run.mock.calls.filter(([id]) => id === 'quote-alerts')).toHaveLength(1);
    expect(mocks.finish).toHaveBeenCalledTimes(3);
  });

  it('keeps a slot retryable when its completion lease cannot be persisted', async () => {
    mocks.finish.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      failed_slots: 1,
      slots: [expect.objectContaining({ error_code: 'watchlist_cron_dispatch_finish_failed' })],
    });
  });
});
