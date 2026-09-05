import { NextResponse } from 'next/server';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { runWatchlistResearchJob } from '@/lib/watchlist/cron-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }

  const run = startCronRun('watchlist-research');
  logCronEvent('info', 'cron_started', run);
  try {
    const result = await runWatchlistResearchJob();
    const durationMs = cronRunDuration(run);
    const response = NextResponse.json({
      ...result,
      cron_run_id: run.runId,
      duration_ms: durationMs,
    });
    response.headers.set('x-cron-run-id', run.runId);
    logCronEvent('info', 'cron_succeeded', run, {
      duration_ms: durationMs,
      claimed: result.claimed,
    });
    return response;
  } catch (error) {
    const durationMs = cronRunDuration(run);
    logCronEvent('error', 'cron_failed', run, {
      duration_ms: durationMs,
      error_code: cronErrorCode(error, 'watchlist_research_cron_failed'),
    });
    return watchlistApiError('watchlist_research_cron_failed', 500, {
      details: { cron_run_id: run.runId, duration_ms: durationMs },
    });
  }
}
