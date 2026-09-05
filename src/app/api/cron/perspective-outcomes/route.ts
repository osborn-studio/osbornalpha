import { NextResponse } from 'next/server';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { runPerspectiveOutcomeJob } from '@/lib/watchlist/cron-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) return watchlistApiError('unauthorized', 401);
  try {
    return NextResponse.json(await runPerspectiveOutcomeJob());
  } catch {
    return watchlistApiError('perspective_outcomes_cron_failed', 500);
  }
}
