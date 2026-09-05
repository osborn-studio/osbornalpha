import { NextResponse } from 'next/server';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { watchlistApiError } from './api-error';
import { runWatchlistAlertJob } from './cron-jobs';
import type { WatchlistAlertScope } from './alert-schedule';

export async function handleWatchlistAlertCron(request: Request, scope: WatchlistAlertScope) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }
  const run = startCronRun(`watchlist-alerts-${scope}`);
  logCronEvent('info', 'cron_started', run, { scope });
  try {
    const result = await runWatchlistAlertJob(scope);
    const durationMs = cronRunDuration(run);
    logCronEvent('info', 'cron_succeeded', run, {
      duration_ms: durationMs,
      scope,
      skipped: 'skipped' in result ? result.skipped : false,
    });
    const response = NextResponse.json({
      ...result,
      cron_run_id: run.runId,
      duration_ms: durationMs,
    });
    response.headers.set('x-cron-run-id', run.runId);
    return response;
  } catch (error) {
    const durationMs = cronRunDuration(run);
    logCronEvent('error', 'cron_failed', run, {
      duration_ms: durationMs,
      scope,
      error_code: cronErrorCode(error, 'watchlist_alert_run_failed'),
    });
    return watchlistApiError('watchlist_alert_run_failed', 500, {
      details: { cron_run_id: run.runId, duration_ms: durationMs, scope },
    });
  }
}
