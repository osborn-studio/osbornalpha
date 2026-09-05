import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/watchlist/cron-schedule', () => ({ scheduledWatchlistCronJobs: mocks.schedule }));
vi.mock('@/lib/watchlist/cron-jobs', () => ({ runWatchlistCronJob: mocks.run }));

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
    expect(await response.json()).toMatchObject({ ok: true, scheduled: 2, succeeded: 2, failed: 0 });
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
});
