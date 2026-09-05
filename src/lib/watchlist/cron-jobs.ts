import { boundedMap } from '@/lib/async/bounded-map';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { builtInMarketCalendar } from '@/lib/market/calendar';
import {
  fetchExchangeCalendarSnapshot,
  loadStoredMarketCalendar,
  persistExchangeCalendarSnapshot,
} from '@/lib/market/calendar-service';
import { resolveQuote } from '@/lib/quotes/resolve-quote';
import { previousQuarterHourWindow } from '@/lib/observability/evaluators';
import { recordAndDeliverCheck } from '@/lib/observability/service';
import {
  claimWatchlistMetricRefresh,
  finishWatchlistMetricRefresh,
} from './metric-snapshot-repository';
import { refreshWatchlistMetricSnapshot } from './metric-snapshot-service';
import {
  claimWatchlistResearchTickerRefresh,
  finishWatchlistResearchTickerRefresh,
  loadWatchlistResearchAudience,
} from './research-refresh-repository';
import {
  fetchWatchlistResearchSources,
  persistWatchlistResearchSnapshot,
} from './research-service';
import {
  claimPerspectiveEvaluations,
  failPerspectiveEvaluation,
  finishPerspectiveEvaluation,
} from './perspective-outcome';
import { runWatchlistAlerts } from './alert-runner';
import type { WatchlistAlertScope } from './alert-schedule';
import {
  evaluateWatchlistOperationalHealth,
  parseWatchlistOperationalHealth,
  watchlistOperationalAlertEvaluation,
} from './operational-health';
import { enqueueWatchlistReviewReminders } from './review-reminders';
import { runPerspectiveGenerationJobs } from '@/lib/stocks/perspective-job-runner';

export type WatchlistCronJobId =
  | 'quote-alerts'
  | 'metric-alerts'
  | 'research-alerts'
  | 'metric-refresh'
  | 'research-refresh'
  | 'perspective-outcomes'
  | 'perspective-generation'
  | 'market-calendar'
  | 'review-reminders'
  | 'operational-health';

export type WatchlistCronJobResult = Record<string, unknown> & { ok: boolean };

export function watchlistBatchJobOutcome(
  claimed: number,
  failed: number,
  partial = 0,
): Pick<WatchlistCronJobResult, 'ok'> & { status: 'complete' | 'partial' | 'failed' } {
  if (failed > 0) return { ok: false, status: 'failed' };
  if (partial > 0) return { ok: false, status: 'partial' };
  return { ok: true, status: 'complete' };
}

function boundedEnvironmentLimit(name: string, fallback: number, maximum: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
}

export async function runWatchlistMetricJob(now = new Date()): Promise<WatchlistCronJobResult> {
  const db = getAdminSupabase();
  const refreshLimit = boundedEnvironmentLimit('WATCHLIST_METRIC_REFRESH_LIMIT', 10, 25);
  const calendar = await loadStoredMarketCalendar(db, now).catch(() => builtInMarketCalendar);
  const claimed = await claimWatchlistMetricRefresh(db, refreshLimit);
  const settled = await boundedMap(claimed, 2, async (item) => {
    try {
      await refreshWatchlistMetricSnapshot(db, item, undefined, now, calendar);
      await finishWatchlistMetricRefresh(db, item, 'succeeded', null, now, calendar);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'watchlist_metric_refresh_failed';
      await finishWatchlistMetricRefresh(db, item, 'failed', message, now, calendar);
      return false;
    }
  });
  const succeeded = settled.filter((result) => result.status === 'fulfilled' && result.value).length;
  const failed = claimed.length - succeeded;
  return { ...watchlistBatchJobOutcome(claimed.length, failed), claimed: claimed.length, succeeded, failed };
}

export async function runWatchlistResearchJob(): Promise<WatchlistCronJobResult> {
  const db = getAdminSupabase();
  const refreshLimit = boundedEnvironmentLimit('WATCHLIST_RESEARCH_REFRESH_LIMIT', 10, 25);
  const claimed = await claimWatchlistResearchTickerRefresh(db, refreshLimit);
  const settled = await boundedMap(claimed, 2, async (item) => {
    try {
      const audience = await loadWatchlistResearchAudience(db, item.ticker);
      if (audience.length === 0) {
        await finishWatchlistResearchTickerRefresh(db, item, 'complete', null);
        return { status: 'complete' as const, distributed: 0 };
      }
      const snapshot = await fetchWatchlistResearchSources(item.ticker);
      const distribution = await boundedMap(audience, 5, (userId) => persistWatchlistResearchSnapshot(db, userId, snapshot));
      const successful = distribution.filter((result) => result.status === 'fulfilled');
      const complete = successful.length === audience.length
        && snapshot.status === 'complete'
        && successful.every((result) => result.status === 'fulfilled' && result.value.status === 'complete');
      const status = successful.length === 0 ? 'failed' as const : complete ? 'complete' as const : 'partial' as const;
      const warnings = [
        ...snapshot.warnings,
        ...(successful.length < audience.length ? ['research_distribution_failed'] : []),
      ];
      await finishWatchlistResearchTickerRefresh(db, item, status, warnings.join(',') || null);
      return { status, distributed: successful.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'watchlist_research_refresh_failed';
      await finishWatchlistResearchTickerRefresh(db, item, 'failed', message);
      return { status: 'failed' as const, distributed: 0 };
    }
  });
  const outcomes = settled.map((item) => item.status === 'fulfilled'
    ? item.value
    : { status: 'failed' as const, distributed: 0 });
  const partial = outcomes.filter((item) => item.status === 'partial').length;
  const failed = outcomes.filter((item) => item.status === 'failed').length;
  return {
    ...watchlistBatchJobOutcome(claimed.length, failed, partial),
    claimed: claimed.length,
    complete: outcomes.filter((item) => item.status === 'complete').length,
    partial,
    failed,
    distributed: outcomes.reduce((sum, item) => sum + item.distributed, 0),
  };
}

export async function runPerspectiveOutcomeJob(): Promise<WatchlistCronJobResult> {
  const db = getAdminSupabase();
  const limit = boundedEnvironmentLimit('WATCHLIST_PERSPECTIVE_OUTCOME_LIMIT', 20, 100);
  const claimed = await claimPerspectiveEvaluations(db, limit);
  const settled = await boundedMap(claimed, 3, async (item) => {
    try {
      const quote = (await resolveQuote(item.ticker)).quote;
      if (!quote || quote.price <= 0) throw new Error('perspective_outcome_quote_unavailable');
      await finishPerspectiveEvaluation(db, item, quote.price);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'perspective_outcome_failed';
      await failPerspectiveEvaluation(db, item.perspective_id, message, item.attempt_count);
      return false;
    }
  });
  const succeeded = settled.filter((result) => result.status === 'fulfilled' && result.value).length;
  const failed = claimed.length - succeeded;
  return { ...watchlistBatchJobOutcome(claimed.length, failed), claimed: claimed.length, succeeded, failed };
}

export async function runPerspectiveGenerationJob(): Promise<WatchlistCronJobResult> {
  const limit = boundedEnvironmentLimit('WATCHLIST_PERSPECTIVE_JOB_LIMIT', 2, 5);
  const result = await runPerspectiveGenerationJobs(limit);
  return { ok: result.failed === 0, ...result };
}

export async function runMarketCalendarJob(now = new Date()): Promise<WatchlistCronJobResult> {
  const providerUrl = process.env.TRADING_CALENDAR_URL?.trim();
  if (!providerUrl) return { ok: true, skipped: true, reason: 'provider_not_configured' };
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 400 * 86_400_000).toISOString().slice(0, 10);
  const snapshot = await fetchExchangeCalendarSnapshot(providerUrl, from, to, {
    apiKey: process.env.TRADING_CALENDAR_API_KEY?.trim(),
  });
  const persisted = await persistExchangeCalendarSnapshot(getAdminSupabase(), snapshot, now);
  return { ok: true, source: snapshot.source, persisted };
}

export async function runWatchlistReviewReminderJob(): Promise<WatchlistCronJobResult> {
  const limit = boundedEnvironmentLimit('WATCHLIST_REVIEW_REMINDER_LIMIT', 500, 2_000);
  const enqueued = await enqueueWatchlistReviewReminders(getAdminSupabase(), limit);
  return { ok: true, status: 'complete', enqueued };
}

export async function runWatchlistAlertJob(scope: WatchlistAlertScope): Promise<WatchlistCronJobResult> {
  return { ok: true, scope, ...await runWatchlistAlerts(scope) };
}

export async function runWatchlistOperationalHealthJob(now = new Date()): Promise<WatchlistCronJobResult> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('get_watchlist_operational_health');
  if (error) throw new Error('watchlist_health_source_unavailable');
  const snapshot = parseWatchlistOperationalHealth(data);
  if (!snapshot) throw new Error('watchlist_health_response_invalid');
  const health = evaluateWatchlistOperationalHealth(snapshot);
  const result = await recordAndDeliverCheck(admin, {
    checkName: 'watchlist_15m',
    window: previousQuarterHourWindow(now),
    ...watchlistOperationalAlertEvaluation(health),
  });
  return { ...result, ok: result.ok !== false };
}

export function runWatchlistCronJob(id: WatchlistCronJobId, now = new Date()): Promise<WatchlistCronJobResult> {
  switch (id) {
    case 'quote-alerts': return runWatchlistAlertJob('quote');
    case 'metric-alerts': return runWatchlistAlertJob('metric');
    case 'research-alerts': return runWatchlistAlertJob('research');
    case 'metric-refresh': return runWatchlistMetricJob(now);
    case 'research-refresh': return runWatchlistResearchJob();
    case 'perspective-outcomes': return runPerspectiveOutcomeJob();
    case 'perspective-generation': return runPerspectiveGenerationJob();
    case 'market-calendar': return runMarketCalendarJob(now);
    case 'review-reminders': return runWatchlistReviewReminderJob();
    case 'operational-health': return runWatchlistOperationalHealthJob(now);
  }
}
