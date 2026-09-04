import { NextResponse } from 'next/server';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { runWatchlistAlerts } from '@/lib/watchlist/alert-runner';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }
  const startedAt = Date.now();
  try {
    const result = await runWatchlistAlerts();
    return NextResponse.json({ ok: true, ...result, duration_ms: Date.now() - startedAt });
  } catch {
    console.error('watchlist alert cron failed');
    return watchlistApiError('watchlist_alert_run_failed', 500, {
      details: { duration_ms: Date.now() - startedAt },
    });
  }
}
