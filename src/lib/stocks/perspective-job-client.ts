import { watchlistJsonRequest } from '@/lib/watchlist/api-client';
import type { PerspectiveGenerationJobView } from './perspective-job-contract';

const ACTIVE_STATUSES = new Set<PerspectiveGenerationJobView['status']>(['queued', 'running']);
const MAX_ACTIVE_POLL_MS = 20 * 60_000;

interface VisibilityDocument {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

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
  return Math.min(10_000, Math.round(1_000 * (1.6 ** Math.max(0, Math.floor(attempt)))));
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('cancelled', 'AbortError');
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener('abort', cancelled);
      resolve();
    }
    function cancelled() {
      clearTimeout(timer);
      reject(abortError(signal));
    }
    signal.addEventListener('abort', cancelled, { once: true });
  });
}

export function waitUntilPageVisible(
  signal: AbortSignal,
  page: VisibilityDocument | undefined = typeof document === 'undefined' ? undefined : document,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (!page || page.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve, reject) => {
    function cleanup() {
      page!.removeEventListener('visibilitychange', changed);
      signal.removeEventListener('abort', cancelled);
    }
    function changed() {
      if (page!.visibilityState === 'hidden') return;
      cleanup();
      resolve();
    }
    function cancelled() {
      cleanup();
      reject(abortError(signal));
    }
    page.addEventListener('visibilitychange', changed);
    signal.addEventListener('abort', cancelled, { once: true });
  });
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
  const fetchJob = dependencies.fetchJob ?? fetchPerspectiveJob;
  const delay = dependencies.delay ?? abortableDelay;
  const waitUntilVisible = dependencies.waitUntilVisible ?? waitUntilPageVisible;
  const maxActivePollMs = dependencies.maxActivePollMs ?? MAX_ACTIVE_POLL_MS;
  let job = initial;
  let attempt = 0;
  let activeWaitMs = 0;

  while (ACTIVE_STATUSES.has(job.status)) {
    await waitUntilVisible(signal);
    if (attempt > 0) {
      const waitMs = perspectiveJobPollDelay(attempt - 1);
      if (activeWaitMs + waitMs > maxActivePollMs) throw new Error('perspective_job_timeout');
      await delay(waitMs, signal);
      activeWaitMs += waitMs;
      // A tab can become hidden during the delay. Do not issue a request until
      // it is visible again; returning to the tab then refreshes immediately.
      await waitUntilVisible(signal);
    }
    job = await fetchJob(job.id, signal);
    onProgress(job);
    attempt += 1;
  }
  return job;
}
