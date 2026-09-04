import type { SupabaseClient } from '@supabase/supabase-js';
import { boundedMap } from '@/lib/async/bounded-map';
import { buildRadar, type RadarPayload } from '@/lib/brief/radar';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Database, WatchlistAlert, WatchlistAlertEvent } from '@/lib/supabase/database.types';
import { deliverWatchlistAlertEvents } from './alert-delivery';
import { evaluateWatchlistAlertBatch } from './alert-evaluator';
import { observationFromRadar } from './alert-observation';
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
  saturated: boolean;
  delivery: { claimed: number; delivered: number; failed: number; deadLetter: number; skipped: number; deferred: number };
}

export interface WatchlistAlertRunDependencies {
  loadBatch: () => Promise<{ alerts: AlertWithItem[]; saturated: boolean }>;
  loadRadar: (ticker: string) => Promise<RadarPayload>;
  loadResearch: (pairs: Array<{ userId: string; ticker: string }>) => Promise<AlertResearchCandidates[]>;
  insertEvent: (event: Partial<WatchlistAlertEvent>) => Promise<'inserted' | 'duplicate'>;
  updateAlert: (alertId: string, update: Partial<WatchlistAlert>) => Promise<void>;
  deliver: () => Promise<WatchlistAlertRunResult['delivery']>;
  now?: () => Date;
}

export async function runWatchlistAlertBatch(
  dependencies: WatchlistAlertRunDependencies,
): Promise<WatchlistAlertRunResult> {
  const { alerts, saturated } = await dependencies.loadBatch();
  const tickers = [...new Set(alerts.map((alert) => itemOf(alert)?.ticker).filter((value): value is string => !!value))];
  const radarSettled = await boundedMap(tickers, 5, (ticker) => dependencies.loadRadar(ticker));
  const radarByTicker = new Map<string, RadarPayload>();
  radarSettled.forEach((result, index) => {
    if (result.status === 'fulfilled') radarByTicker.set(tickers[index], result.value);
  });

  const pairs = [...new Map(alerts.flatMap((alert) => {
    const item = itemOf(alert);
    if (!item) return [];
    const pair = { userId: alert.user_id, ticker: item.ticker };
    return [[pairKey(pair.userId, pair.ticker), pair] as const];
  })).values()];
  const research = await dependencies.loadResearch(pairs);
  const researchByPair = new Map(research.map((row) => [pairKey(row.ownerId, row.ticker), row]));

  let triggered = 0;
  let unavailable = 0;
  for (const alert of alerts) {
    const item = itemOf(alert);
    const radar = item ? radarByTicker.get(item.ticker) : null;
    if (!item || !radar) {
      unavailable += 1;
      const evaluatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
      await dependencies.updateAlert(alert.id, { last_evaluated_at: evaluatedAt, updated_at: evaluatedAt });
      continue;
    }

    const candidates = researchByPair.get(pairKey(alert.user_id, item.ticker));
    const now = (dependencies.now ?? (() => new Date()))();
    const observation = observationFromRadar(radar, candidates?.reports, candidates?.perspectives, now);
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
  return { evaluated: alerts.length, triggered, unavailable, saturated, delivery };
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
    saturated: false,
    delivery: { claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 },
  };
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await runWatchlistAlertBatch(dependencies);
    aggregate.evaluated += result.evaluated;
    aggregate.triggered += result.triggered;
    aggregate.unavailable += result.unavailable;
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

function productionDependencies(db: SupabaseClient<Database>): WatchlistAlertRunDependencies {
  return {
    loadBatch: () => loadAlertRunBatch(db),
    loadRadar: (ticker) => buildRadar(ticker),
    loadResearch: (pairs) => loadAlertResearchCandidates(db, pairs),
    insertEvent: (event) => insertAlertEvent(db, event),
    updateAlert: (alertId, update) => updateAlertObservation(db, alertId, update),
    deliver: () => deliverWatchlistAlertEvents(db),
  };
}

export async function runWatchlistAlerts(): Promise<(WatchlistAlertRunResult & { runId: string }) | { skipped: true; reason: 'already_running' }> {
  const db = getAdminSupabase();
  const startedAt = new Date();
  const runId = await createAlertRun(db, startedAt.toISOString());
  if (!runId) return { skipped: true, reason: 'already_running' };
  try {
    const result = await runWatchlistAlertCycles(productionDependencies(db), {
      maxBatches: 5,
      shouldContinue: () => Date.now() - startedAt.getTime() < 240_000,
    });
    const finishedAt = new Date();
    await finishAlertRun(db, runId, {
      status: 'succeeded',
      evaluated: result.evaluated,
      triggered: result.triggered,
      unavailable: result.unavailable,
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
