import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runProviderCanaries: vi.fn(),
  providerCanariesPassed: vi.fn(),
  recordProviderHealth: vi.fn(),
}));

vi.mock('./provider-canary', () => ({
  runWatchlistProviderCanaries: mocks.runProviderCanaries,
  providerCanariesPassed: mocks.providerCanariesPassed,
}));
vi.mock('./provider-health-repository', () => ({
  recordWatchlistProviderHealth: mocks.recordProviderHealth,
}));

import { watchlistBatchJobOutcome } from './cron-jobs';
import { runWatchlistProviderHealthJob } from './cron-jobs';

describe('watchlistBatchJobOutcome', () => {
  it('reports a fully processed or empty batch as complete', () => {
    expect(watchlistBatchJobOutcome(0, 0)).toEqual({ ok: true, status: 'complete' });
    expect(watchlistBatchJobOutcome(3, 0)).toEqual({ ok: true, status: 'complete' });
  });

  it('does not hide partial or failed work from the dispatcher', () => {
    expect(watchlistBatchJobOutcome(3, 0, 1)).toEqual({ ok: false, status: 'partial' });
    expect(watchlistBatchJobOutcome(3, 1)).toEqual({ ok: false, status: 'failed' });
    expect(watchlistBatchJobOutcome(3, 1, 1)).toEqual({ ok: false, status: 'failed' });
  });
});

describe('watchlist provider health job', () => {
  it('does not persist a failed health result when the job is cancelled', async () => {
    const controller = new AbortController();
    mocks.runProviderCanaries.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));

    await expect(runWatchlistProviderHealthJob(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.recordProviderHealth).not.toHaveBeenCalled();
  });
});
