import { describe, expect, it, vi } from 'vitest';
import {
  planWatchlistCronDispatch,
  runWatchlistCronJobWithTimeout,
  watchlistCronJobWaves,
} from './cron-dispatch';

describe('Watchlist cron dispatch planning', () => {
  it('runs metric refresh before metric alerts while keeping siblings parallelizable', () => {
    expect(watchlistCronJobWaves([
      'quote-alerts', 'metric-refresh', 'metric-alerts', 'operational-health',
    ])).toEqual([
      ['quote-alerts', 'metric-refresh', 'operational-health'],
      ['metric-alerts'],
    ]);
  });

  it('does not invent a dependency when the refresh job is not scheduled', () => {
    expect(watchlistCronJobWaves(['quote-alerts', 'metric-alerts'])).toEqual([
      ['quote-alerts', 'metric-alerts'],
    ]);
  });

  it('sorts slots and deduplicates jobs across a bounded catch-up window', () => {
    const plan = planWatchlistCronDispatch([
      { scheduledFor: '2026-09-05T12:17:00Z', leaseToken: 'lease-2', attemptCount: 1 },
      { scheduledFor: '2026-09-05T12:02:00Z', leaseToken: 'lease-1', attemptCount: 1 },
    ]);
    expect(plan.slots.map((slot) => slot.scheduledFor)).toEqual([
      '2026-09-05T12:02:00Z', '2026-09-05T12:17:00Z',
    ]);
    expect(plan.jobs.filter((job) => job === 'quote-alerts')).toHaveLength(1);
    expect(plan.jobs).toContain('metric-refresh');
  });
});

describe('runWatchlistCronJobWithTimeout', () => {
  it('rejects a job that exceeds its own deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = runWatchlistCronJobWithTimeout(() => new Promise(() => {}), 100);
      const rejection = expect(pending).rejects.toThrow('watchlist_cron_job_timeout');
      await vi.advanceTimersByTimeAsync(101);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts cooperative work before rejecting the deadline', async () => {
    vi.useFakeTimers();
    const observed: AbortSignal[] = [];
    try {
      const pending = runWatchlistCronJobWithTimeout((signal) => {
        observed.push(signal);
        return new Promise(() => {});
      }, 100);
      const rejection = expect(pending).rejects.toThrow('watchlist_cron_job_timeout');
      await vi.advanceTimersByTimeAsync(101);
      await rejection;
      expect(observed[0].aborted).toBe(true);
      expect(observed[0].reason).toEqual(expect.objectContaining({ message: 'watchlist_cron_job_timeout' }));
    } finally {
      vi.useRealTimers();
    }
  });
});
