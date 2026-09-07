import { describe, expect, it, vi } from 'vitest';
import type { WatchlistResearchJobView } from './research-job-contract';
import { isWatchlistResearchJob, waitForWatchlistResearchJob } from './research-job-client';

const queued: WatchlistResearchJobView = {
  id: 'job-1', ticker: 'AAPL', status: 'queued', stage: 'queued', progress: 0, errorCode: null, result: null,
  createdAt: '2026-09-05T12:00:00Z', startedAt: null, finishedAt: null, nextAttemptAt: '2026-09-05T12:00:00Z',
};

describe('Watchlist research job client', () => {
  it('validates and polls through the shared durable job loop', async () => {
    expect(isWatchlistResearchJob(queued)).toBe(true);
    const succeeded = { ...queued, status: 'succeeded' as const, stage: 'complete' as const, progress: 100 };
    const fetchJob = vi.fn(async () => succeeded);
    const progress = vi.fn();
    await expect(waitForWatchlistResearchJob(queued, new AbortController().signal, progress, {
      fetchJob, delay: async () => undefined, waitUntilVisible: async () => undefined,
    })).resolves.toBe(succeeded);
    expect(progress).toHaveBeenCalledWith(succeeded);
  });
});
