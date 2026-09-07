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
import { refreshWatchlistCompositionSnapshots } from './composition-snapshot-repository';
import { runWatchlistResearchJobs } from './research-job-runner';
import { providerCanariesPassed, runWatchlistProviderCanaries } from './provider-canary';
import { recordWatchlistProviderHealth } from './provider-health-repository';
import { cleanupWatchlistCronDispatchSlots } from './cron-dispatch-repository';
import { cleanupWatchlistApiRateLimits } from './api-rate-limit';

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
  | 'provider-health'
  | 'maintenance'
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

export async function runWatchlistMetricJob(now = new Date(), signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  const db = getAdminSupabase();
  const refreshLimit = boundedEnvironmentLimit('WATCHLIST_METRIC_REFRESH_LIMIT', 10, 25);
  const calendar = await loadStoredMarketCalendar(db, now).catch(() => builtInMarketCalendar);
  const claimed = await claimWatchlistMetricRefresh(db, refreshLimit);
  const settled = await boundedMap(claimed, 2, async (item) => {
    try {
      signal?.throwIfAborted();
      await refreshWatchlistMetricSnapshot(db, item, undefined, now, calendar);
      signal?.throwIfAborted();
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
  let compositionRefreshed = 0;
  let compositionFailed = false;
  try {
    compositionRefreshed = await refreshWatchlistCompositionSnapshots(
      db,
      boundedEnvironmentLimit('WATCHLIST_COMPOSITION_REFRESH_LIMIT', 6, 20),
    );
  } catch {
    compositionFailed = true;
  }
  return {
    ...watchlistBatchJobOutcome(claimed.length, failed, compositionFailed ? 1 : 0),
    claimed: claimed.length,
    succeeded,
    failed,
    composition_refreshed: compositionRefreshed,
    composition_failed: compositionFailed,
  };
}

export async function runWatchlistResearchJob(signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  const db = getAdminSupabase();
  const refreshLimit = boundedEnvironmentLimit('WATCHLIST_RESEARCH_REFRESH_LIMIT', 10, 25);
  const manualJobs = await runWatchlistResearchJobs(
    boundedEnvironmentLimit('WATCHLIST_RESEARCH_JOB_LIMIT', 2, 5),
    db,
  );
  const claimed = await claimWatchlistResearchTickerRefresh(db, refreshLimit);
  const settled = await boundedMap(claimed, 2, async (item) => {
    try {
      signal?.throwIfAborted();
      const audience = await loadWatchlistResearchAudience(db, item.ticker);
      if (audience.length === 0) {
        await finishWatchlistResearchTickerRefresh(db, item, 'complete', null);
        return { status: 'complete' as const, distributed: 0 };
      }
      const snapshot = await fetchWatchlistResearchSources(item.ticker, undefined, signal);
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
    ...watchlistBatchJobOutcome(claimed.length + manualJobs.claimed, failed + manualJobs.failed, partial),
    claimed: claimed.length,
    complete: outcomes.filter((item) => item.status === 'complete').length,
    partial,
    failed,
    distributed: outcomes.reduce((sum, item) => sum + item.distributed, 0),
    manual_jobs: manualJobs,
  };
}

export async function runPerspectiveOutcomeJob(signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  const db = getAdminSupabase();
  const limit = boundedEnvironmentLimit('WATCHLIST_PERSPECTIVE_OUTCOME_LIMIT', 20, 100);
  const claimed = await claimPerspectiveEvaluations(db, limit);
  const settled = await boundedMap(claimed, 3, async (item) => {
    try {
      const quote = (await resolveQuote(item.ticker, { signal })).quote;
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

export async function runPerspectiveGenerationJob(signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  const limit = boundedEnvironmentLimit('WATCHLIST_PERSPECTIVE_JOB_LIMIT', 2, 5);
  const result = await runPerspectiveGenerationJobs(limit);
  return { ok: result.failed === 0, ...result };
}

export async function runMarketCalendarJob(now = new Date(), signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  const providerUrl = process.env.TRADING_CALENDAR_URL?.trim();
  if (!providerUrl) return { ok: true, skipped: true, reason: 'provider_not_configured' };
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 400 * 86_400_000).toISOString().slice(0, 10);
  const snapshot = await fetchExchangeCalendarSnapshot(providerUrl, from, to, {
    apiKey: process.env.TRADING_CALENDAR_API_KEY?.trim(),
    signal,
  });
  const persisted = await persistExchangeCalendarSnapshot(getAdminSupabase(), snapshot, now);
  return { ok: true, source: snapshot.source, persisted };
}

export async function runWatchlistReviewReminderJob(): Promise<WatchlistCronJobResult> {
  const limit = boundedEnvironmentLimit('WATCHLIST_REVIEW_REMINDER_LIMIT', 500, 2_000);
  const enqueued = await enqueueWatchlistReviewReminders(getAdminSupabase(), limit);
  return { ok: true, status: 'complete', enqueued };
}

export async function runWatchlistAlertJob(scope: WatchlistAlertScope, signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  return { ok: true, scope, ...await runWatchlistAlerts(scope, signal) };
}

export async function runWatchlistOperationalHealthJob(now = new Date()): Promise<WatchlistCronJobResult> {
  const admin = getAdminSupabase();
  const repository = admin as unknown as {
    rpc(name: string): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const [base, dispatch] = await Promise.all([
    repository.rpc('get_watchlist_operational_health'),
    repository.rpc('get_watchlist_cron_dispatch_health'),
  ]);
  if (base.error || dispatch.error) throw new Error('watchlist_health_source_unavailable');
  const snapshot = parseWatchlistOperationalHealth({
    ...(base.data && typeof base.data === 'object' && !Array.isArray(base.data) ? base.data : {}),
    cron_dispatch: dispatch.data,
  });
  if (!snapshot) throw new Error('watchlist_health_response_invalid');
  const health = evaluateWatchlistOperationalHealth(snapshot);
  const result = await recordAndDeliverCheck(admin, {
    checkName: 'watchlist_15m',
    window: previousQuarterHourWindow(now),
    ...watchlistOperationalAlertEvaluation(health),
  });
  return { ...result, ok: result.ok !== false };
}

export async function runWatchlistProviderHealthJob(signal?: AbortSignal): Promise<WatchlistCronJobResult> {
  const results = await runWatchlistProviderCanaries({ signal });
  await recordWatchlistProviderHealth(getAdminSupabase(), results);
  return {
    ok: providerCanariesPassed(results),
    checked: results.length,
    passed: results.filter((item) => item.status === 'passed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
  };
}

export async function runWatchlistMaintenanceJob(): Promise<WatchlistCronJobResult> {
  const admin = getAdminSupabase();
  const client = admin as unknown as {
    rpc(name: 'cleanup_watchlist_operational_history', args: {
      p_job_retention_days: number;
      p_evidence_retention_days: number;
      p_limit: number;
    }): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  };
  const bulkClient = admin as unknown as {
    rpc(name: 'cleanup_watchlist_bulk_workflow_runs', args: {
      p_retention_days: number;
      p_limit: number;
    }): Promise<{ data: number | null; error: { message: string } | null }>;
  };
  const retentionDays = boundedEnvironmentLimit('WATCHLIST_JOB_RETENTION_DAYS', 30, 365);
  const deleteLimit = boundedEnvironmentLimit('WATCHLIST_RETENTION_DELETE_LIMIT', 1000, 5000);
  const [history, bulkRuns, dispatchSlots, rateLimits] = await Promise.all([
    client.rpc('cleanup_watchlist_operational_history', {
      p_job_retention_days: retentionDays,
      p_evidence_retention_days: boundedEnvironmentLimit('WATCHLIST_EVIDENCE_RETENTION_DAYS', 90, 730),
      p_limit: deleteLimit,
    }),
    bulkClient.rpc('cleanup_watchlist_bulk_workflow_runs', {
      p_retention_days: retentionDays,
      p_limit: deleteLimit,
    }),
    cleanupWatchlistCronDispatchSlots(admin, retentionDays, deleteLimit),
    cleanupWatchlistApiRateLimits(admin, 7, deleteLimit),
  ]);
  if (history.error) throw new Error(`watchlist_maintenance_failed:${history.error.message}`);
  if (bulkRuns.error) throw new Error(`watchlist_bulk_workflow_maintenance_failed:${bulkRuns.error.message}`);
  return {
    ok: true,
    status: 'complete',
    ...(history.data ?? {}),
    bulk_workflow_runs: bulkRuns.data ?? 0,
    cron_dispatch_slots: dispatchSlots,
    api_rate_limits: rateLimits,
  };
}

export function runWatchlistCronJob(
  id: WatchlistCronJobId,
  now = new Date(),
  signal?: AbortSignal,
): Promise<WatchlistCronJobResult> {
  signal?.throwIfAborted();
  switch (id) {
    case 'quote-alerts': return runWatchlistAlertJob('quote', signal);
    case 'metric-alerts': return runWatchlistAlertJob('metric', signal);
    case 'research-alerts': return runWatchlistAlertJob('research', signal);
    case 'metric-refresh': return runWatchlistMetricJob(now, signal);
    case 'research-refresh': return runWatchlistResearchJob(signal);
    case 'perspective-outcomes': return runPerspectiveOutcomeJob(signal);
    case 'perspective-generation': return runPerspectiveGenerationJob(signal);
    case 'market-calendar': return runMarketCalendarJob(now, signal);
    case 'review-reminders': return runWatchlistReviewReminderJob();
    case 'provider-health': return runWatchlistProviderHealthJob(signal);
    case 'maintenance': return runWatchlistMaintenanceJob();
    case 'operational-health': return runWatchlistOperationalHealthJob(now);
  }
}
