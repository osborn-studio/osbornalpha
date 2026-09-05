import { NextResponse } from 'next/server';
import { boundedMap } from '@/lib/async/bounded-map';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { runWatchlistCronJob } from '@/lib/watchlist/cron-jobs';
import { scheduledWatchlistCronJobs } from '@/lib/watchlist/cron-schedule';

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
  const jobs = scheduledWatchlistCronJobs(now);
  const concurrency = boundedSetting('WATCHLIST_DISPATCH_CONCURRENCY', 2, 1, 4);
  const budgetMs = boundedSetting('WATCHLIST_DISPATCH_BUDGET_MS', 270_000, 30_000, 280_000);
  const minStartMs = boundedSetting('WATCHLIST_DISPATCH_MIN_START_MS', 10_000, 1_000, 60_000);
  const deadline = run.startedAtMs + budgetMs;
  logCronEvent('info', 'cron_started', run, { jobs, concurrency, budget_ms: budgetMs });

  const settled = await boundedMap(jobs, concurrency, async (id) => {
    const startedAt = Date.now();
    if (deadline - startedAt < minStartMs) {
      return { id, status: 'skipped_budget' as const, duration_ms: 0 };
    }
    try {
      const result = await runWatchlistCronJob(id, now);
      if (!result.ok) throw new Error('watchlist_cron_job_unsuccessful');
      return { id, status: 'succeeded' as const, duration_ms: Date.now() - startedAt, result };
    } catch (error) {
      return {
        id,
        status: 'failed' as const,
        duration_ms: Date.now() - startedAt,
        error_code: cronErrorCode(error, 'watchlist_cron_job_failed'),
      };
    }
  });
  const results = settled.map((item, index) => item.status === 'fulfilled'
    ? item.value
    : { id: jobs[index], status: 'failed' as const, duration_ms: 0, error_code: 'watchlist_cron_job_rejected' });
  const failed = results.filter((item) => item.status !== 'succeeded');
  const durationMs = cronRunDuration(run);
  const responseBody = {
    ok: failed.length === 0,
    cron_run_id: run.runId,
    scheduled: jobs.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    duration_ms: durationMs,
    results,
  };
  logCronEvent(failed.length > 0 ? 'error' : 'info', failed.length > 0 ? 'cron_failed' : 'cron_succeeded', run, {
    duration_ms: durationMs,
    scheduled: jobs.length,
    failed: failed.length,
  });
  if (failed.length > 0) {
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
