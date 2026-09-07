import { waitForDurableJob, type DurableJobPollingDependencies } from '@/lib/jobs/durable-job-client';
import { watchlistJsonRequest } from './api-client';
import type { WatchlistResearchJobView } from './research-job-contract';

export function isWatchlistResearchJob(value: unknown): value is WatchlistResearchJobView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === 'string' && typeof job.ticker === 'string'
    && ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.status))
    && ['queued', 'sources', 'persistence', 'complete'].includes(String(job.stage))
    && typeof job.progress === 'number' && Number.isFinite(job.progress)
    && (job.errorCode === null || typeof job.errorCode === 'string')
    && (job.result === null || typeof job.result === 'object')
    && typeof job.createdAt === 'string' && typeof job.nextAttemptAt === 'string';
}

async function fetchJob(id: string, signal: AbortSignal): Promise<WatchlistResearchJobView> {
  const body = await watchlistJsonRequest<{ job?: unknown }>(`/api/watchlist/research/jobs/${encodeURIComponent(id)}`, {
    signal, cache: 'no-store',
  }, 'watchlist_research_job_unavailable');
  if (!isWatchlistResearchJob(body.job)) throw new Error('watchlist_research_job_unavailable');
  return body.job;
}

export async function fetchActiveWatchlistResearchJob(
  ticker: string,
  signal: AbortSignal,
): Promise<WatchlistResearchJobView | null> {
  const body = await watchlistJsonRequest<{ job?: unknown }>(
    `/api/watchlist/research/jobs?ticker=${encodeURIComponent(ticker)}`,
    { signal, cache: 'no-store' },
    'watchlist_research_job_unavailable',
  );
  if (body.job == null) return null;
  if (!isWatchlistResearchJob(body.job)) throw new Error('watchlist_research_job_unavailable');
  return body.job;
}

export function waitForWatchlistResearchJob(
  initial: WatchlistResearchJobView,
  signal: AbortSignal,
  onProgress: (job: WatchlistResearchJobView) => void,
  dependencies: Partial<DurableJobPollingDependencies<WatchlistResearchJobView>> = {},
): Promise<WatchlistResearchJobView> {
  return waitForDurableJob(initial, signal, onProgress, {
    fetchJob: dependencies.fetchJob ?? fetchJob,
    delay: dependencies.delay,
    waitUntilVisible: dependencies.waitUntilVisible,
    maxActivePollMs: dependencies.maxActivePollMs,
  });
}
