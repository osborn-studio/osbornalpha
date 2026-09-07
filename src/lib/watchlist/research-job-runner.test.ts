import { describe, expect, it, vi } from 'vitest';
import type { WatchlistResearchJob } from '@/lib/supabase/database.types';
import { runWatchlistResearchJob, type WatchlistResearchJobRunnerDependencies } from './research-job-runner';

const job: WatchlistResearchJob = {
  id: 'job-1', user_id: 'user-1', ticker: 'AAPL', status: 'running', stage: 'sources', progress: 10,
  attempt_count: 1, max_attempts: 3, quota_plan: 'free', quota_limit: 10, quota_used: 1,
  next_attempt_at: '2026-09-05T12:00:00Z', lease_expires_at: '2026-09-05T12:10:00Z', lease_token: 'lease-1',
  cancel_requested_at: null, result: {}, error_code: null, created_at: '2026-09-05T12:00:00Z',
  started_at: '2026-09-05T12:00:00Z', finished_at: null, updated_at: '2026-09-05T12:00:00Z',
};

function bundle(news: Array<{ id: string }> = []) {
  return {
    news: { items: news }, reports: { items: [] }, perspectives: [], perspectivesGeneratedAt: null,
  } as never;
}

function dependencies(overrides: Partial<WatchlistResearchJobRunnerDependencies> = {}) {
  const updateJob = vi.fn(async () => true);
  return {
    value: {
      fetchSources: vi.fn(async () => ({ ticker: 'AAPL' } as never)),
      persist: vi.fn(async () => ({ status: 'complete', refreshedAt: '2026-09-05T12:00:02Z', warnings: [] } as never)),
      loadBundle: vi.fn().mockResolvedValueOnce(bundle()).mockResolvedValueOnce(bundle([{ id: 'news-1' }])),
      loadJob: vi.fn(async () => job),
      updateJob,
      now: () => new Date('2026-09-05T12:00:03Z'),
      ...overrides,
    } as WatchlistResearchJobRunnerDependencies,
    updateJob,
  };
}

describe('Watchlist research job runner', () => {
  it('persists through existing research services and stores only the change summary', async () => {
    const { value, updateJob } = dependencies();
    await expect(runWatchlistResearchJob({}, job, value)).resolves.toBe('succeeded');
    expect(value.fetchSources).toHaveBeenCalledWith('AAPL', undefined, expect.any(AbortSignal));
    expect(value.persist).toHaveBeenCalledWith({}, 'user-1', { ticker: 'AAPL' });
    expect(updateJob).toHaveBeenCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({
      status: 'succeeded', result: expect.objectContaining({ changes: expect.objectContaining({ newNews: 1 }) }),
    }));
  });

  it('requeues transient failures with a stable code', async () => {
    const { value, updateJob } = dependencies({ fetchSources: vi.fn(async () => { throw new Error('watchlist_research_refresh_failed'); }) });
    await expect(runWatchlistResearchJob({}, job, value)).resolves.toBe('queued');
    expect(updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({
      status: 'queued', error_code: 'watchlist_research_refresh_failed', lease_token: null,
    }));
  });

  it('terminates explicitly non-retryable failures', async () => {
    const failure = Object.assign(new Error('search_provider_http_401'), { retryable: false });
    const { value, updateJob } = dependencies({ fetchSources: vi.fn(async () => { throw failure; }) });
    await expect(runWatchlistResearchJob({}, job, value)).resolves.toBe('failed');
    expect(updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({
      status: 'failed', error_code: 'search_provider_http_401', lease_token: null,
    }));
  });

  it('honors cancellation before external work starts', async () => {
    const cancelled = { ...job, cancel_requested_at: '2026-09-05T12:00:01Z' };
    const { value, updateJob } = dependencies({ loadJob: vi.fn(async () => cancelled) });
    await expect(runWatchlistResearchJob({}, job, value)).resolves.toBe('cancelled');
    expect(value.fetchSources).not.toHaveBeenCalled();
    expect(updateJob).toHaveBeenCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({ status: 'cancelled' }));
  });
});
