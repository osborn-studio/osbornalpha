import { NextResponse } from 'next/server';
import { boundedMap } from '@/lib/async/bounded-map';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from '@/lib/observability/cron-run';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  claimWatchlistResearchTickerRefresh,
  finishWatchlistResearchTickerRefresh,
  loadWatchlistResearchAudience,
} from '@/lib/watchlist/research-refresh-repository';
import {
  fetchWatchlistResearchSources,
  persistWatchlistResearchSnapshot,
} from '@/lib/watchlist/research-service';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function refreshLimit() {
  const parsed = Number(process.env.WATCHLIST_RESEARCH_REFRESH_LIMIT ?? 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 25) : 10;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return watchlistApiError('cron_unavailable', 503);
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return watchlistApiError('unauthorized', 401);
  }

  const run = startCronRun('watchlist-research');
  logCronEvent('info', 'cron_started', run, { refresh_limit: refreshLimit() });
  try {
    const db = getAdminSupabase();
    const claimed = await claimWatchlistResearchTickerRefresh(db, refreshLimit());
    const settled = await boundedMap(claimed, 2, async (item) => {
      try {
        const audience = await loadWatchlistResearchAudience(db, item.ticker);
        if (audience.length === 0) {
          await finishWatchlistResearchTickerRefresh(db, item, 'complete', null);
          return { status: 'complete' as const, distributed: 0 };
        }
        const snapshot = await fetchWatchlistResearchSources(item.ticker);
        const distribution = await boundedMap(audience, 5, (userId) => (
          persistWatchlistResearchSnapshot(db, userId, snapshot)
        ));
        const successful = distribution.filter((result) => result.status === 'fulfilled');
        const complete = successful.length === audience.length
          && snapshot.status === 'complete'
          && successful.every((result) => result.status === 'fulfilled' && result.value.status === 'complete');
        const outcome = successful.length === 0 ? 'failed' as const : complete ? 'complete' as const : 'partial' as const;
        const warnings = [
          ...snapshot.warnings,
          ...(successful.length < audience.length ? ['research_distribution_failed'] : []),
        ];
        await finishWatchlistResearchTickerRefresh(db, item, outcome, warnings.join(',') || null);
        return { status: outcome, distributed: successful.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'watchlist_research_refresh_failed';
        await finishWatchlistResearchTickerRefresh(db, item, 'failed', message);
        return { status: 'failed' as const, distributed: 0 };
      }
    });
    const outcomes = settled.map((item) => item.status === 'fulfilled'
      ? item.value
      : { status: 'failed' as const, distributed: 0 });
    const durationMs = cronRunDuration(run);
    const response = NextResponse.json({
      ok: true,
      cron_run_id: run.runId,
      claimed: claimed.length,
      complete: outcomes.filter((item) => item.status === 'complete').length,
      partial: outcomes.filter((item) => item.status === 'partial').length,
      failed: outcomes.filter((item) => item.status === 'failed').length,
      distributed: outcomes.reduce((sum, item) => sum + item.distributed, 0),
      duration_ms: durationMs,
    });
    response.headers.set('x-cron-run-id', run.runId);
    logCronEvent('info', 'cron_succeeded', run, {
      duration_ms: durationMs,
      claimed: claimed.length,
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
