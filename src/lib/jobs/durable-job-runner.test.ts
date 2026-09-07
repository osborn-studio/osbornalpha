import { describe, expect, it, vi } from 'vitest';
import {
  durableJobErrorCode,
  durableJobRetryAt,
  durableJobShouldRetry,
  monitorDurableJobState,
} from './durable-job-runner';

describe('durable job runner policy', () => {
  it('normalizes error codes and honors explicit retryability', () => {
    expect(durableJobErrorCode({ code: 'provider_rate_limited' }, 'fallback')).toBe('provider_rate_limited');
    expect(durableJobErrorCode(new Error('unsafe error text'), 'fallback')).toBe('fallback');
    expect(durableJobShouldRetry({ retryable: true }, 'transient', 1, 3)).toBe(true);
    expect(durableJobShouldRetry({ retryable: false }, 'protocol', 1, 3)).toBe(false);
    expect(durableJobShouldRetry(new Error('permanent'), 'permanent', 1, 3, new Set(['permanent']))).toBe(false);
  });

  it('uses bounded exponential backoff', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    expect(durableJobRetryAt(1, now)).toBe('2026-09-05T12:01:00.000Z');
    expect(durableJobRetryAt(10, now)).toBe('2026-09-05T12:30:00.000Z');
  });

  it('aborts provider work when the lease becomes inactive', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const stop = monitorDurableJobState(async () => 'cancelled', controller, 'job', 10);
      await vi.advanceTimersByTimeAsync(10);
      expect(controller.signal.aborted).toBe(true);
      expect((controller.signal.reason as Error).message).toBe('job_cancelled');
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
