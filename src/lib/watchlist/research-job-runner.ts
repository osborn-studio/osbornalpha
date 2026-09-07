import { boundedMap } from '@/lib/async/bounded-map';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { WatchlistResearchJob } from '@/lib/supabase/database.types';
import {
  fetchWatchlistResearchSources,
  loadWatchlistResearchBundle,
  persistWatchlistResearchSnapshot,
} from './research-service';
import { summarizeWatchlistResearchChanges } from './research-timeline';
import {
  claimWatchlistResearchJobs,
  loadWatchlistResearchJob,
  updateWatchlistResearchJob,
  type WatchlistResearchJobDatabase,
} from './research-job-repository';
import {
  durableJobErrorCode,
  durableJobRetryAt,
  durableJobShouldRetry,
  monitorDurableJobState,
} from '@/lib/jobs/durable-job-runner';

export type WatchlistResearchJobOutcome = 'succeeded' | 'queued' | 'failed' | 'cancelled' | 'superseded';

export interface WatchlistResearchJobRunnerDependencies {
  fetchSources: typeof fetchWatchlistResearchSources;
  persist: typeof persistWatchlistResearchSnapshot;
  loadBundle: typeof loadWatchlistResearchBundle;
  loadJob: typeof loadWatchlistResearchJob;
  updateJob: typeof updateWatchlistResearchJob;
  now: () => Date;
}

const productionDependencies: WatchlistResearchJobRunnerDependencies = {
  fetchSources: fetchWatchlistResearchSources,
  persist: persistWatchlistResearchSnapshot,
  loadBundle: loadWatchlistResearchBundle,
  loadJob: loadWatchlistResearchJob,
  updateJob: updateWatchlistResearchJob,
  now: () => new Date(),
};

function researchInput(bundle: Awaited<ReturnType<typeof loadWatchlistResearchBundle>>) {
  return {
    news: bundle.news.items,
    reports: bundle.reports.items,
    perspectives: bundle.perspectives,
    perspectivesGeneratedAt: bundle.perspectivesGeneratedAt,
  };
}

const PERMANENT_ERROR_CODES = new Set([
  'invalid_ticker',
  'not_authenticated',
  'search_provider_aborted',
  'search_provider_not_configured',
  'watchlist_item_not_found',
]);

async function state(
  db: WatchlistResearchJobDatabase,
  job: WatchlistResearchJob,
  leaseToken: string,
  dependencies: WatchlistResearchJobRunnerDependencies,
): Promise<'active' | 'cancelled' | 'superseded'> {
  const current = await dependencies.loadJob(db, job.id);
  if (!current || current.status !== 'running' || current.lease_token !== leaseToken) return 'superseded';
  return current.cancel_requested_at ? 'cancelled' : 'active';
}

export async function runWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  job: WatchlistResearchJob,
  dependencies: WatchlistResearchJobRunnerDependencies = productionDependencies,
): Promise<WatchlistResearchJobOutcome> {
  const leaseToken = job.lease_token;
  if (!leaseToken) return 'superseded';
  const controller = new AbortController();
  let stopMonitoring: () => void = () => {};
  const update = (patch: Partial<WatchlistResearchJob>) => dependencies.updateJob(db, job.id, leaseToken, patch);
  const finishCancelled = async () => {
    const at = dependencies.now().toISOString();
    return await update({
      status: 'cancelled', stage: 'complete', progress: 100, lease_expires_at: null, lease_token: null,
      error_code: null, finished_at: at, updated_at: at,
    }) ? 'cancelled' as const : 'superseded' as const;
  };
  try {
    const initial = await state(db, job, leaseToken, dependencies);
    if (initial === 'superseded') return 'superseded';
    if (initial === 'cancelled') return finishCancelled();

    stopMonitoring = monitorDurableJobState(
      () => state(db, job, leaseToken, dependencies),
      controller,
      'watchlist_research_job',
    );
    const before = await dependencies.loadBundle(db, job.user_id, job.ticker);
    const sourceSnapshot = await dependencies.fetchSources(job.ticker, undefined, controller.signal);
    if (await state(db, job, leaseToken, dependencies) === 'cancelled') return finishCancelled();
    if (!await update({
      stage: 'persistence', progress: 70,
      lease_expires_at: new Date(dependencies.now().getTime() + 10 * 60_000).toISOString(),
      updated_at: dependencies.now().toISOString(),
    })) return 'superseded';

    const refresh = await dependencies.persist(db, job.user_id, sourceSnapshot);
    if (await state(db, job, leaseToken, dependencies) === 'cancelled') return finishCancelled();
    const after = await dependencies.loadBundle(db, job.user_id, job.ticker);
    const at = dependencies.now().toISOString();
    const result = {
      changes: summarizeWatchlistResearchChanges(researchInput(before), researchInput(after)),
      refresh: { status: refresh.status, refreshedAt: refresh.refreshedAt, warnings: refresh.warnings },
    };
    return await update({
      status: 'succeeded', stage: 'complete', progress: 100, result,
      error_code: null, lease_expires_at: null, lease_token: null, finished_at: at, updated_at: at,
    }) ? 'succeeded' : 'superseded';
  } catch (error) {
    const at = dependencies.now();
    const currentState = await state(db, job, leaseToken, dependencies).catch(() => 'superseded' as const);
    if (currentState === 'superseded') return 'superseded';
    if (currentState === 'cancelled') return finishCancelled();
    const code = durableJobErrorCode(error, 'watchlist_research_job_failed');
    const retry = durableJobShouldRetry(
      error,
      code,
      job.attempt_count,
      job.max_attempts,
      PERMANENT_ERROR_CODES,
    );
    const updated = await update(retry ? {
      status: 'queued', stage: 'queued', progress: 0,
      next_attempt_at: durableJobRetryAt(job.attempt_count, at),
      error_code: code, lease_expires_at: null, lease_token: null, updated_at: at.toISOString(),
    } : {
      status: 'failed', stage: 'complete', progress: 100, error_code: code,
      lease_expires_at: null, lease_token: null, finished_at: at.toISOString(), updated_at: at.toISOString(),
    });
    return updated ? retry ? 'queued' : 'failed' : 'superseded';
  } finally {
    stopMonitoring();
  }
}

async function runClaimed(
  limit: number,
  db: WatchlistResearchJobDatabase,
  jobId: string | null,
): Promise<{ claimed: number; succeeded: number; queued: number; failed: number; cancelled: number; superseded: number }> {
  const jobs = await claimWatchlistResearchJobs(db, limit, jobId);
  const settled = await boundedMap(jobs, 2, (job) => runWatchlistResearchJob(db, job));
  const outcomes = settled.map((result) => result.status === 'fulfilled' ? result.value : 'failed');
  return {
    claimed: jobs.length,
    succeeded: outcomes.filter((value) => value === 'succeeded').length,
    queued: outcomes.filter((value) => value === 'queued').length,
    failed: outcomes.filter((value) => value === 'failed').length,
    cancelled: outcomes.filter((value) => value === 'cancelled').length,
    superseded: outcomes.filter((value) => value === 'superseded').length,
  };
}

export function runWatchlistResearchJobs(
  limit = 2,
  db: WatchlistResearchJobDatabase = getAdminSupabase(),
) {
  return runClaimed(limit, db, null);
}

export function runWatchlistResearchJobById(
  jobId: string,
  db: WatchlistResearchJobDatabase = getAdminSupabase(),
) {
  return runClaimed(1, db, jobId);
}
