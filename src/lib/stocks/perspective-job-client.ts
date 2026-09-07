import { watchlistJsonRequest } from '@/lib/watchlist/api-client';
import type { PerspectiveGenerationJobView } from './perspective-job-contract';
import {
  abortableJobDelay,
  durableJobPollDelay,
  waitForDurableJob,
  waitUntilPageVisible as waitUntilDurableJobPageVisible,
} from '@/lib/jobs/durable-job-client';

export interface PerspectiveJobPollingDependencies {
  fetchJob?: (id: string, signal: AbortSignal) => Promise<PerspectiveGenerationJobView>;
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  waitUntilVisible?: (signal: AbortSignal) => Promise<void>;
  maxActivePollMs?: number;
}

export function isPerspectiveGenerationJob(value: unknown): value is PerspectiveGenerationJobView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === 'string'
    && typeof job.ticker === 'string'
    && ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.status))
    && ['queued', 'context', 'model', 'persistence', 'complete'].includes(String(job.stage))
    && typeof job.progress === 'number' && Number.isFinite(job.progress)
    && typeof job.createdAt === 'string'
    && typeof job.nextAttemptAt === 'string';
}

export function perspectiveJobPollDelay(attempt: number): number {
  return durableJobPollDelay(attempt);
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return abortableJobDelay(milliseconds, signal);
}

export function waitUntilPageVisible(
  signal: AbortSignal,
  page: Parameters<typeof waitUntilDurableJobPageVisible>[1] = typeof document === 'undefined' ? undefined : document,
): Promise<void> {
  return waitUntilDurableJobPageVisible(signal, page);
}

async function fetchPerspectiveJob(id: string, signal: AbortSignal): Promise<PerspectiveGenerationJobView> {
  const body = await watchlistJsonRequest<{ job?: unknown }>(`/api/perspectives/jobs/${encodeURIComponent(id)}`, {
    signal,
    cache: 'no-store',
  }, 'perspective_job_unavailable');
  if (!isPerspectiveGenerationJob(body.job)) throw new Error('perspective_job_unavailable');
  return body.job;
}

export async function fetchActivePerspectiveJob(
  ticker: string,
  signal: AbortSignal,
): Promise<PerspectiveGenerationJobView | null> {
  const body = await watchlistJsonRequest<{ job?: unknown }>(
    `/api/perspectives/jobs?ticker=${encodeURIComponent(ticker)}`,
    { signal, cache: 'no-store' },
    'perspective_job_unavailable',
  );
  if (body.job === null || body.job === undefined) return null;
  if (!isPerspectiveGenerationJob(body.job)) throw new Error('perspective_job_unavailable');
  return body.job;
}

export async function waitForPerspectiveJob(
  initial: PerspectiveGenerationJobView,
  signal: AbortSignal,
  onProgress: (job: PerspectiveGenerationJobView) => void,
  dependencies: PerspectiveJobPollingDependencies = {},
): Promise<PerspectiveGenerationJobView> {
  try {
    return await waitForDurableJob(initial, signal, onProgress, {
      fetchJob: dependencies.fetchJob ?? fetchPerspectiveJob,
      delay: dependencies.delay,
      waitUntilVisible: dependencies.waitUntilVisible,
      maxActivePollMs: dependencies.maxActivePollMs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'durable_job_timeout') throw new Error('perspective_job_timeout');
    throw error;
  }
}
