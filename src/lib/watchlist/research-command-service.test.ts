import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ owns: vi.fn(), enqueue: vi.fn(), schedule: vi.fn() }));
vi.mock('./server-repository', () => ({ userOwnsWatchlistTicker: mocks.owns }));
vi.mock('./research-job-repository', async (importOriginal) => ({
  ...await importOriginal<typeof import('./research-job-repository')>(),
  enqueueWatchlistResearchJob: mocks.enqueue,
}));
vi.mock('./research-job-dispatch', () => ({ scheduleWatchlistResearchWorker: mocks.schedule }));

import { enqueueWatchlistResearchRefresh } from './research-command-service';

describe('enqueueWatchlistResearchRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owns.mockResolvedValue(true);
    mocks.enqueue.mockResolvedValue({ id: 'job-1', status: 'queued' });
  });

  it('checks ownership before enqueueing and schedules queued work', async () => {
    await expect(enqueueWatchlistResearchRefresh({} as never, 'user-1', 'AAPL')).resolves.toMatchObject({ id: 'job-1' });
    expect(mocks.owns).toHaveBeenCalledWith({}, 'user-1', 'AAPL');
    expect(mocks.enqueue).toHaveBeenCalledWith({}, 'AAPL');
    expect(mocks.schedule).toHaveBeenCalledWith('job-1');
  });

  it('does not consume quota for unowned tickers', async () => {
    mocks.owns.mockResolvedValue(false);
    await expect(enqueueWatchlistResearchRefresh({} as never, 'user-1', 'NVDA')).rejects.toMatchObject({
      code: 'watchlist_item_not_found',
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('does not reschedule an already completed idempotent job', async () => {
    mocks.enqueue.mockResolvedValue({ id: 'job-1', status: 'succeeded' });
    await enqueueWatchlistResearchRefresh({} as never, 'user-1', 'AAPL');
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
