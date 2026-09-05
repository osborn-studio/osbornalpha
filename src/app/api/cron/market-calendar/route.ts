import { NextResponse } from 'next/server';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { runMarketCalendarJob } from '@/lib/watchlist/cron-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }
  const run = startCronRun('market-calendar');
  try {
    const result = await runMarketCalendarJob();
    const durationMs = cronRunDuration(run);
    logCronEvent('info', 'cron_succeeded', run, { duration_ms: durationMs, persisted: result.persisted });
    const response = NextResponse.json({
      ...result, cron_run_id: run.runId, duration_ms: durationMs,
    });
    response.headers.set('x-cron-run-id', run.runId);
    return response;
  } catch (error) {
    const durationMs = cronRunDuration(run);
    logCronEvent('error', 'cron_failed', run, {
      duration_ms: durationMs,
      error_code: cronErrorCode(error, 'market_calendar_sync_failed'),
    });
    return watchlistApiError('market_calendar_sync_failed', 500, {
      details: { cron_run_id: run.runId, duration_ms: durationMs },
    });
  }
}
