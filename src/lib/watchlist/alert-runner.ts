import type { SupabaseClient } from '@supabase/supabase-js';
import { boundedMap } from '@/lib/async/bounded-map';
import { buildCalendar, type CalendarPayload } from '@/lib/brief/calendar';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Database, WatchlistAlert, WatchlistAlertEvent, WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import { resolveQuote, type QuoteShape } from '@/lib/quotes/resolve-quote';
import { deliverWatchlistAlertEvents } from './alert-delivery';
import { evaluateWatchlistAlertBatch } from './alert-evaluator';
import { observationFromMetricSnapshot, observationFromQuote, observationFromResearch } from './alert-observation';
import {
  createAlertRun,
  finishAlertRun,
  insertAlertEvent,
  loadAlertResearchCandidates,
  loadAlertRunBatch,
  updateAlertObservation,
  type AlertResearchCandidates,
  type AlertWithItem,
} from './alert-run-repository';
import { shouldEvaluateWatchlistAlert, type WatchlistAlertScope } from './alert-schedule';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';
import { loadStoredMarketCalendar } from '@/lib/market/calendar-service';
import { loadWatchlistMetricSnapshots } from './metric-snapshot-repository';

function itemOf(alert: AlertWithItem) {
  return Array.isArray(alert.watchlist_items) ? alert.watchlist_items[0] : alert.watchlist_items;
}

function pairKey(userId: string, ticker: string) {
  return `${userId}:${ticker}`;
}

export interface WatchlistAlertRunResult {
  evaluated: number;
  triggered: number;
  unavailable: number;
  skippedClosed: number;
  saturated: boolean;
  delivery: { claimed: number; delivered: number; failed: number; deadLetter: number; skipped: number; deferred: number };
}

export interface WatchlistAlertRunDependencies {
  loadBatch: () => Promise<{ alerts: AlertWithItem[]; saturated: boolean }>;
  loadQuote: (ticker: string) => Promise<QuoteShape | null>;
  loadMetrics: (tickers: string[]) => Promise<Record<string, WatchlistMetricSnapshot>>;
  loadCalendar: (ticker: string) => Promise<CalendarPayload | null>;
  loadResearch: (pairs: Array<{ userId: string; ticker: string }>) => Promise<AlertResearchCandidates[]>;
  insertEvent: (event: Partial<WatchlistAlertEvent>) => Promise<'inserted' | 'duplicate'>;
  updateAlert: (alertId: string, update: Partial<WatchlistAlert>) => Promise<void>;
  deliver: () => Promise<WatchlistAlertRunResult['delivery']>;
  now?: () => Date;
  shouldEvaluate?: (alert: AlertWithItem, now: Date) => boolean;
  calendar?: MarketCalendarProvider;
}

function isQuoteAlert(alert: Pick<WatchlistAlert, 'alert_type'>) {
  return ['price', 'change_pct', 'volume_ratio', 'valuation'].includes(alert.alert_type);
}

function isStoredResearchAlert(alert: Pick<WatchlistAlert, 'alert_type'>) {
  return alert.alert_type === 'rating' || alert.alert_type === 'perspective';
}

function isMetricAlert(alert: Pick<WatchlistAlert, 'alert_type'>) {
  return alert.alert_type === 'metric';
}

export async function runWatchlistAlertBatch(
  dependencies: WatchlistAlertRunDependencies,
): Promise<WatchlistAlertRunResult> {
  const { alerts, saturated } = await dependencies.loadBatch();
  const scheduleNow = (dependencies.now ?? (() => new Date()))();
  const eligibleAlerts = alerts.filter((alert) => !dependencies.shouldEvaluate || dependencies.shouldEvaluate(alert, scheduleNow));
  const skippedAlerts = alerts.filter((alert) => !eligibleAlerts.includes(alert));
  await boundedMap(skippedAlerts, 5, async (alert) => {
    const evaluatedAt = scheduleNow.toISOString();
    await dependencies.updateAlert(alert.id, { last_evaluated_at: evaluatedAt, updated_at: evaluatedAt });
  });
  const quoteTickers = [...new Set(eligibleAlerts.filter(isQuoteAlert)
    .map((alert) => itemOf(alert)?.ticker).filter((value): value is string => !!value))];
  const quoteSettled = await boundedMap(quoteTickers, 5, (ticker) => dependencies.loadQuote(ticker));
  const quoteByTicker = new Map<string, QuoteShape | null>();
  quoteSettled.forEach((result, index) => {
    if (result.status === 'fulfilled') quoteByTicker.set(quoteTickers[index], result.value);
  });

  const metricTickers = [...new Set(eligibleAlerts.filter(isMetricAlert)
    .map((alert) => itemOf(alert)?.ticker).filter((value): value is string => !!value))];
  const metricsByTicker = metricTickers.length > 0
    ? await dependencies.loadMetrics(metricTickers)
    : {};

  const eventTickers = [...new Set(eligibleAlerts.filter((alert) => alert.alert_type === 'event')
    .map((alert) => itemOf(alert)?.ticker).filter((value): value is string => !!value))];
  const calendarSettled = await boundedMap(eventTickers, 5, (ticker) => dependencies.loadCalendar(ticker));
  const calendarByTicker = new Map<string, CalendarPayload | null>();
  calendarSettled.forEach((result, index) => {
    if (result.status === 'fulfilled') calendarByTicker.set(eventTickers[index], result.value);
  });

  const pairs = [...new Map(eligibleAlerts.filter(isStoredResearchAlert).flatMap((alert) => {
    const item = itemOf(alert);
    if (!item) return [];
    const pair = { userId: alert.user_id, ticker: item.ticker };
    return [[pairKey(pair.userId, pair.ticker), pair] as const];
  })).values()];
  const research = pairs.length > 0 ? await dependencies.loadResearch(pairs) : [];
  const researchByPair = new Map(research.map((row) => [pairKey(row.ownerId, row.ticker), row]));

  let triggered = 0;
  let unavailable = 0;
  for (const alert of eligibleAlerts) {
    const item = itemOf(alert);
    if (!item) {
      unavailable += 1;
      const evaluatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
      await dependencies.updateAlert(alert.id, { last_evaluated_at: evaluatedAt, updated_at: evaluatedAt });
      continue;
    }

    const candidates = researchByPair.get(pairKey(alert.user_id, item.ticker));
    const now = (dependencies.now ?? (() => new Date()))();
    const sourceUnavailable = isQuoteAlert(alert)
      ? !quoteByTicker.get(item.ticker)
      : isMetricAlert(alert)
        ? !metricsByTicker[item.ticker]
      : alert.alert_type === 'event'
        ? !calendarByTicker.get(item.ticker)
        : false;
    if (sourceUnavailable) unavailable += 1;
    const observation = isQuoteAlert(alert)
      ? observationFromQuote(item.ticker, quoteByTicker.get(item.ticker) ?? null, now, dependencies.calendar)
      : isMetricAlert(alert)
        ? observationFromMetricSnapshot(metricsByTicker[item.ticker] ?? null, now)
      : observationFromResearch(
          alert.alert_type === 'event' ? calendarByTicker.get(item.ticker) ?? null : null,
          candidates?.reports,
          candidates?.perspectives,
          now,
        );
    const evaluations = evaluateWatchlistAlertBatch(alert, observation);
    const latest = evaluations[0];
    let insertedForAlert = 0;

    for (const evaluation of evaluations) {
      if (!evaluation.eventKey) continue;
      const outcome = await dependencies.insertEvent({
        user_id: alert.user_id,
        alert_id: alert.id,
        watchlist_item_id: alert.watchlist_item_id,
        ticker: item.ticker,
        alert_type: alert.alert_type,
        event_key: evaluation.eventKey,
        observed_value: evaluation.observedValue,
        threshold_numeric: alert.threshold_numeric,
        payload: { label: evaluation.label, ...evaluation.payload },
        delivery_status: evaluation.triggered ? 'pending' : 'skipped',
        last_delivery_error: evaluation.triggered ? null : evaluation.reason,
        triggered_at: observation.observedAt,
      });
      if (outcome === 'inserted' && evaluation.triggered) {
        triggered += 1;
        insertedForAlert += 1;
      }
    }

    const evaluatedAt = now.toISOString();
    await dependencies.updateAlert(alert.id, {
      last_observed_value: latest.observedValue,
      last_observed_key: latest.observedKey,
      last_evaluated_at: evaluatedAt,
      ...(insertedForAlert > 0 ? { last_triggered_at: observation.observedAt } : {}),
      updated_at: evaluatedAt,
    });
  }

  const delivery = await dependencies.deliver();
  return { evaluated: eligibleAlerts.length, triggered, unavailable, skippedClosed: skippedAlerts.length, saturated, delivery };
}

export async function runWatchlistAlertCycles(
  dependencies: WatchlistAlertRunDependencies,
  options: { maxBatches?: number; shouldContinue?: () => boolean } = {},
): Promise<WatchlistAlertRunResult> {
  const maxBatches = Math.min(Math.max(Math.floor(options.maxBatches ?? 5), 1), 10);
  const aggregate: WatchlistAlertRunResult = {
    evaluated: 0,
    triggered: 0,
    unavailable: 0,
    skippedClosed: 0,
    saturated: false,
    delivery: { claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 },
  };
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await runWatchlistAlertBatch(dependencies);
    aggregate.evaluated += result.evaluated;
    aggregate.triggered += result.triggered;
    aggregate.unavailable += result.unavailable;
    aggregate.skippedClosed += result.skippedClosed;
    aggregate.delivery.claimed += result.delivery.claimed;
    aggregate.delivery.delivered += result.delivery.delivered;
    aggregate.delivery.failed += result.delivery.failed;
    aggregate.delivery.deadLetter += result.delivery.deadLetter;
    aggregate.delivery.skipped += result.delivery.skipped;
    aggregate.delivery.deferred += result.delivery.deferred;
    aggregate.saturated = result.saturated;
    if (!result.saturated || (options.shouldContinue && !options.shouldContinue())) break;
  }
  return aggregate;
}

function productionDependencies(
  db: SupabaseClient<Database>,
  scope: WatchlistAlertScope,
  calendar: MarketCalendarProvider,
): WatchlistAlertRunDependencies {
  return {
    loadBatch: () => loadAlertRunBatch(db, scope),
    loadQuote: async (ticker) => (await resolveQuote(ticker)).quote,
    loadMetrics: (tickers) => loadWatchlistMetricSnapshots(db, tickers, '1y'),
    loadCalendar: (ticker) => buildCalendar(ticker, 14),
    loadResearch: (pairs) => loadAlertResearchCandidates(db, pairs),
    insertEvent: (event) => insertAlertEvent(db, event),
    updateAlert: (alertId, update) => updateAlertObservation(db, alertId, update),
    deliver: () => deliverWatchlistAlertEvents(db),
    shouldEvaluate: (alert, now) => {
      const item = itemOf(alert);
      return !!item && shouldEvaluateWatchlistAlert(alert, item.ticker, scope, now, calendar);
    },
    calendar,
  };
}

export async function runWatchlistAlerts(
  scope: WatchlistAlertScope = 'all',
): Promise<(WatchlistAlertRunResult & { runId: string }) | { skipped: true; reason: 'already_running' }> {
  const db = getAdminSupabase();
  const startedAt = new Date();
  const runId = await createAlertRun(db, startedAt.toISOString(), scope);
  if (!runId) return { skipped: true, reason: 'already_running' };
  try {
    const calendar = await loadStoredMarketCalendar(db, startedAt).catch(() => builtInMarketCalendar);
    const result = await runWatchlistAlertCycles(productionDependencies(db, scope, calendar), {
      maxBatches: 5,
      shouldContinue: () => Date.now() - startedAt.getTime() < 240_000,
    });
    const finishedAt = new Date();
    await finishAlertRun(db, runId, {
      status: 'succeeded',
      evaluated: result.evaluated,
      triggered: result.triggered,
      unavailable: result.unavailable,
      skipped_closed: result.skippedClosed,
      delivery_claimed: result.delivery.claimed,
      delivery_delivered: result.delivery.delivered,
      delivery_failed: result.delivery.failed,
      delivery_dead_letter: result.delivery.deadLetter,
      delivery_skipped: result.delivery.skipped,
      delivery_deferred: result.delivery.deferred,
      saturated: result.saturated,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      finished_at: finishedAt.toISOString(),
    });
    return { ...result, runId };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : 'watchlist_alert_run_failed';
    await finishAlertRun(db, runId, {
      status: 'failed',
      error: message.slice(0, 1_000),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      finished_at: finishedAt.toISOString(),
    });
    throw error;
  }
}
