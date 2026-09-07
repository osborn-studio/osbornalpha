import { NextResponse } from 'next/server';
import { boundedMap } from '@/lib/async/bounded-map';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { runWatchlistCronJob, type WatchlistCronJobId } from '@/lib/watchlist/cron-jobs';
import {
  planWatchlistCronDispatch,
  runWatchlistCronJobWithTimeout,
  watchlistCronJobDependencies,
  watchlistCronJobWaves,
} from '@/lib/watchlist/cron-dispatch';
import {
  claimWatchlistCronDispatchSlots,
  finishWatchlistCronDispatchSlot,
} from '@/lib/watchlist/cron-dispatch-repository';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function boundedSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }

  const run = startCronRun('watchlist-dispatch');
  const now = new Date();
  const concurrency = boundedSetting('WATCHLIST_DISPATCH_CONCURRENCY', 2, 1, 4);
  const budgetMs = boundedSetting('WATCHLIST_DISPATCH_BUDGET_MS', 270_000, 30_000, 280_000);
  const minStartMs = boundedSetting('WATCHLIST_DISPATCH_MIN_START_MS', 10_000, 1_000, 60_000);
  const jobTimeoutMs = boundedSetting('WATCHLIST_DISPATCH_JOB_TIMEOUT_MS', 90_000, 1_000, 240_000);
  const lookbackMinutes = boundedSetting('WATCHLIST_DISPATCH_LOOKBACK_MINUTES', 120, 0, 1_440);
  const slotLimit = boundedSetting('WATCHLIST_DISPATCH_SLOT_LIMIT', 8, 1, 96);
  const leaseMinutes = boundedSetting('WATCHLIST_DISPATCH_LEASE_MINUTES', 5, 1, 15);
  const deadline = run.startedAtMs + budgetMs;
  let plan;
  try {
    const claimed = await claimWatchlistCronDispatchSlots(
      getAdminSupabase(),
      now,
      { lookbackMinutes, limit: slotLimit, leaseMinutes },
    );
    plan = planWatchlistCronDispatch(claimed);
  } catch (error) {
    const durationMs = cronRunDuration(run);
    const errorCode = cronErrorCode(error, 'watchlist_cron_dispatch_claim_failed');
    logCronEvent('error', 'cron_failed', run, { duration_ms: durationMs, error_code: errorCode });
    const response = watchlistApiError('watchlist_dispatch_unavailable', 503, { retryAfterSeconds: 60 });
    response.headers.set('x-cron-run-id', run.runId);
    return response;
  }
  const { jobs, slots } = plan;
  const scheduled = new Set(jobs);
  logCronEvent('info', 'cron_started', run, {
    jobs, slots: slots.map((slot) => slot.scheduledFor), concurrency,
    budget_ms: budgetMs, job_timeout_ms: jobTimeoutMs,
  });

  type DispatchResult =
    | { id: WatchlistCronJobId; status: 'succeeded'; duration_ms: number; result: Awaited<ReturnType<typeof runWatchlistCronJob>> }
    | { id: WatchlistCronJobId; status: 'failed'; duration_ms: number; error_code: string }
    | { id: WatchlistCronJobId; status: 'skipped_budget' | 'skipped_dependency'; duration_ms: 0 };
  const resultByJob = new Map<WatchlistCronJobId, DispatchResult>();
  for (const wave of watchlistCronJobWaves(jobs)) {
    const settled = await boundedMap(wave, concurrency, async (id): Promise<DispatchResult> => {
      const dependencyFailed = watchlistCronJobDependencies(id)
        .some((dependency) => scheduled.has(dependency)
          && resultByJob.get(dependency)?.status !== 'succeeded');
      if (dependencyFailed) return { id, status: 'skipped_dependency', duration_ms: 0 };
      const startedAt = Date.now();
      const remainingMs = deadline - startedAt;
      if (remainingMs < minStartMs) return { id, status: 'skipped_budget', duration_ms: 0 };
      try {
        const result = await runWatchlistCronJobWithTimeout(
          (signal) => runWatchlistCronJob(id, now, signal),
          Math.min(jobTimeoutMs, remainingMs),
        );
        if (!result.ok) throw new Error('watchlist_cron_job_unsuccessful');
        return { id, status: 'succeeded', duration_ms: Date.now() - startedAt, result };
      } catch (error) {
        return {
          id,
          status: 'failed',
          duration_ms: Date.now() - startedAt,
          error_code: cronErrorCode(error, 'watchlist_cron_job_failed'),
        };
      }
    });
    settled.forEach((item, index) => resultByJob.set(
      wave[index],
      item.status === 'fulfilled'
        ? item.value
        : { id: wave[index], status: 'failed', duration_ms: 0, error_code: 'watchlist_cron_job_rejected' },
    ));
  }
  const results = jobs.map((id) => resultByJob.get(id)
    ?? { id, status: 'failed' as const, duration_ms: 0, error_code: 'watchlist_cron_job_missing' });
  const failed = results.filter((item) => item.status !== 'succeeded');
  const slotResults = await Promise.all(slots.map(async (slot) => {
    const failedJob = slot.jobs.map((id) => resultByJob.get(id))
      .find((result) => result?.status !== 'succeeded');
    const outcome = failedJob ? 'failed' as const : 'succeeded' as const;
    const errorCode = failedJob && 'error_code' in failedJob
      ? failedJob.error_code
      : failedJob ? `watchlist_cron_${failedJob.status}` : null;
    try {
      await finishWatchlistCronDispatchSlot(getAdminSupabase(), slot, outcome, errorCode);
      return { scheduled_for: slot.scheduledFor, status: outcome, error_code: errorCode };
    } catch (error) {
      void error;
      return {
        scheduled_for: slot.scheduledFor,
        status: 'failed' as const,
        error_code: 'watchlist_cron_dispatch_finish_failed',
      };
    }
  }));
  const failedSlots = slotResults.filter((slot) => slot.status === 'failed');
  const durationMs = cronRunDuration(run);
  const responseBody = {
    ok: failed.length === 0 && failedSlots.length === 0,
    cron_run_id: run.runId,
    scheduled_slots: slots.length,
    failed_slots: failedSlots.length,
    scheduled: jobs.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    duration_ms: durationMs,
    results,
    slots: slotResults,
  };
  logCronEvent(responseBody.ok ? 'info' : 'error', responseBody.ok ? 'cron_succeeded' : 'cron_failed', run, {
    duration_ms: durationMs,
    scheduled: jobs.length,
    failed: failed.length,
    scheduled_slots: slots.length,
    failed_slots: failedSlots.length,
  });
  if (!responseBody.ok) {
    const response = watchlistApiError('watchlist_dispatch_incomplete', 503, {
      details: responseBody,
      retryAfterSeconds: 60,
    });
    response.headers.set('x-cron-run-id', run.runId);
    return response;
  }
  const response = NextResponse.json(responseBody);
  response.headers.set('x-cron-run-id', run.runId);
  return response;
}
