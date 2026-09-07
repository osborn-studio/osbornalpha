import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/watchlist/alert-runner', () => ({ runWatchlistAlerts: mocks.run }));

import { GET } from './route';

describe('GET /api/cron/watchlist-alerts/quotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
    mocks.run.mockResolvedValue({
      evaluated: 1, triggered: 0, unavailable: 0, skippedClosed: 0, saturated: false,
      delivery: { claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 },
      runId: 'run-1',
    });
  });

  it('fails closed when the secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(new Request('https://example.test/api/cron/watchlist-alerts/quotes'));
    expect(response.status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('runs only the quote scope with a valid bearer', async () => {
    const response = await GET(new Request('https://example.test/api/cron/watchlist-alerts/quotes', {
      headers: { authorization: 'Bearer secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, scope: 'quote', evaluated: 1 });
    expect(mocks.run).toHaveBeenCalledWith('quote', undefined);
  });
});
