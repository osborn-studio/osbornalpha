import { describe, expect, it, vi } from 'vitest';
import { enqueueWatchlistResearchJob, WatchlistResearchJobRepositoryError } from './research-job-repository';

describe('Watchlist research job repository', () => {
  it('enqueues through the atomic database boundary', async () => {
    const job = { id: 'job-1', ticker: 'AAPL' };
    const rpc = vi.fn(async () => ({ data: job, error: null }));
    await expect(enqueueWatchlistResearchJob({ rpc }, 'AAPL')).resolves.toBe(job);
    expect(rpc).toHaveBeenCalledWith('enqueue_watchlist_research_job', { p_ticker: 'AAPL' });
  });

  it('preserves plan quota details without provider output', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'watchlist_research_plan_limit:10:10:free' } }));
    const error = await enqueueWatchlistResearchJob({ rpc }, 'AAPL').catch((caught) => caught);
    expect(error).toBeInstanceOf(WatchlistResearchJobRepositoryError);
    expect(error).toMatchObject({ code: 'watchlist_research_plan_limit', quota: { used: 10, limit: 10, plan: 'free' } });
  });
});
