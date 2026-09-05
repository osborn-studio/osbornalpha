import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveGenerationJobView } from './perspective-job-contract';
import {
  perspectiveJobPollDelay,
  waitForPerspectiveJob,
  waitUntilPageVisible,
} from './perspective-job-client';

function job(status: PerspectiveGenerationJobView['status'], progress: number): PerspectiveGenerationJobView {
  return {
    id: 'job-1', ticker: 'AAPL', status, stage: status === 'succeeded' ? 'complete' : 'model', progress,
    errorCode: null, createdAt: '2026-09-04T12:00:00Z', startedAt: null, finishedAt: null,
    nextAttemptAt: '2026-09-04T12:00:00Z',
  };
}

describe('perspective job client', () => {
  it('backs off quickly and caps polling at ten seconds', () => {
    expect([0, 1, 2, 3, 20].map(perspectiveJobPollDelay)).toEqual([1_000, 1_600, 2_560, 4_096, 10_000]);
  });

  it('polls immediately, reports progress, and stops at a terminal state', async () => {
    const fetchJob = vi.fn()
      .mockResolvedValueOnce(job('running', 40))
      .mockResolvedValueOnce(job('succeeded', 100));
    const delay = vi.fn(async () => {});
    const waitUntilVisible = vi.fn(async () => {});
    const onProgress = vi.fn();

    await expect(waitForPerspectiveJob(job('queued', 0), new AbortController().signal, onProgress, {
      fetchJob, delay, waitUntilVisible,
    })).resolves.toMatchObject({ status: 'succeeded' });
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(1_000, expect.any(AbortSignal));
    expect(onProgress.mock.calls.map(([value]) => value.progress)).toEqual([40, 100]);
  });

  it('does not spend the polling budget while the page is hidden', async () => {
    const order: string[] = [];
    const waitUntilVisible = vi.fn(async () => { order.push('visible'); });
    const delay = vi.fn(async () => { order.push('delay'); });
    const fetchJob = vi.fn(async () => {
      order.push('fetch');
      return fetchJob.mock.calls.length === 1 ? job('running', 50) : job('succeeded', 100);
    });
    await waitForPerspectiveJob(job('queued', 0), new AbortController().signal, () => {}, {
      fetchJob, delay, waitUntilVisible,
    });
    expect(order).toEqual(['visible', 'fetch', 'visible', 'delay', 'visible', 'fetch']);
  });

  it('waits for a hidden page and resolves as soon as it becomes visible', async () => {
    let listener: (() => void) | null = null;
    const page = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((_type: 'visibilitychange', value: () => void) => { listener = value; }),
      removeEventListener: vi.fn(),
    };
    const pending = waitUntilPageVisible(new AbortController().signal, page);
    page.visibilityState = 'visible';
    (listener as (() => void) | null)?.();
    await expect(pending).resolves.toBeUndefined();
    expect(page.removeEventListener).toHaveBeenCalled();
  });

  it('fails deterministically once the active polling budget is exhausted', async () => {
    await expect(waitForPerspectiveJob(job('running', 10), new AbortController().signal, () => {}, {
      fetchJob: async () => job('running', 20),
      delay: async () => {},
      waitUntilVisible: async () => {},
      maxActivePollMs: 500,
    })).rejects.toThrow('perspective_job_timeout');
  });
});
