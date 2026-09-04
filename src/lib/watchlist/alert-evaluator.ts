import type { WatchlistAlert } from '@/lib/supabase/database.types';

export interface WatchlistAlertCandidate {
  key: string;
  kind?: string | null;
  label: string;
  occurredAt?: string | null;
  value?: string | null;
  payload?: Record<string, unknown>;
}

export interface WatchlistAlertObservation {
  observedAt: string;
  marketDataStatus?: 'fresh' | 'stale' | 'unavailable';
  price: number | null;
  changePct: number | null;
  volumeRatio: number | null;
  peTtm: number | null;
  pb: number | null;
  events: WatchlistAlertCandidate[];
  ratings: WatchlistAlertCandidate[];
  perspectives: WatchlistAlertCandidate[];
}

export interface WatchlistAlertEvaluation {
  observedValue: number | null;
  observedKey: string | null;
  triggered: boolean;
  eventKey: string | null;
  label: string | null;
  payload: Record<string, unknown>;
  reason: 'matched' | 'not_matched' | 'missing_data' | 'cooldown' | 'already_seen';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase())
    : [];
}

function numericValue(alert: WatchlistAlert, observation: WatchlistAlertObservation): number | null {
  if (alert.alert_type === 'price') return observation.price;
  if (alert.alert_type === 'change_pct') return observation.changePct;
  if (alert.alert_type === 'volume_ratio') return observation.volumeRatio;
  if (alert.alert_type === 'valuation') {
    return alert.config.metric === 'pb' ? observation.pb : observation.peTtm;
  }
  return null;
}

function numericMatch(
  operator: WatchlistAlert['operator'],
  current: number,
  threshold: number,
  previous: number | null,
): boolean {
  if (operator === 'gt') return current > threshold;
  if (operator === 'gte') return current >= threshold;
  if (operator === 'lt') return current < threshold;
  if (operator === 'lte') return current <= threshold;
  if (operator === 'crosses_above') return previous !== null && previous <= threshold && current > threshold;
  if (operator === 'crosses_below') return previous !== null && previous >= threshold && current < threshold;
  return false;
}

function inCooldown(alert: WatchlistAlert, observedAt: string): boolean {
  if (!alert.last_triggered_at) return false;
  const last = new Date(alert.last_triggered_at).getTime();
  const current = new Date(observedAt).getTime();
  return Number.isFinite(last) && Number.isFinite(current)
    && current - last < alert.cooldown_minutes * 60_000;
}

function candidateBaseline(
  alert: WatchlistAlert,
  candidate: WatchlistAlertCandidate,
  reason: 'cooldown' | 'already_seen',
): WatchlistAlertEvaluation {
  return {
    observedValue: null,
    observedKey: candidate.key,
    triggered: false,
    eventKey: `${alert.alert_type}:${candidate.key}`,
    label: candidate.label,
    payload: {
      kind: candidate.kind ?? null,
      value: candidate.value ?? null,
      occurredAt: candidate.occurredAt ?? null,
      ...candidate.payload,
    },
    reason,
  };
}

function observationBucket(observedAt: string): string {
  const value = new Date(observedAt).getTime();
  if (!Number.isFinite(value)) return observedAt;
  return new Date(Math.floor(value / (15 * 60_000)) * 15 * 60_000).toISOString();
}

function candidateSet(alert: WatchlistAlert, observation: WatchlistAlertObservation) {
  if (alert.alert_type === 'event') return observation.events;
  if (alert.alert_type === 'rating') return observation.ratings;
  return observation.perspectives;
}

function candidateEvaluation(
  alert: WatchlistAlert,
  candidate: WatchlistAlertCandidate,
): WatchlistAlertEvaluation {
  return {
    observedValue: null,
    observedKey: candidate.key,
    triggered: true,
    eventKey: `${alert.alert_type}:${candidate.key}`,
    label: candidate.label,
    payload: {
      kind: candidate.kind ?? null,
      value: candidate.value ?? null,
      occurredAt: candidate.occurredAt ?? null,
      ...candidate.payload,
    },
    reason: 'matched',
  };
}

function matchesCandidate(alert: WatchlistAlert, candidate: WatchlistAlertCandidate): boolean {
  const kinds = stringList(alert.config.kinds);
  const values = stringList(alert.config.values);
  if (kinds.length > 0 && (!candidate.kind || !kinds.includes(candidate.kind.toLowerCase()))) return false;
  if (values.length > 0 && (!candidate.value || !values.includes(candidate.value.toLowerCase()))) return false;
  return true;
}

export function evaluateWatchlistAlert(
  alert: WatchlistAlert,
  observation: WatchlistAlertObservation,
): WatchlistAlertEvaluation {
  const base = {
    observedValue: null,
    observedKey: alert.last_observed_key,
    triggered: false,
    eventKey: null,
    label: null,
    payload: {},
  };

  if (['price', 'change_pct', 'volume_ratio', 'valuation'].includes(alert.alert_type)) {
    const current = numericValue(alert, observation);
    if (observation.marketDataStatus === 'stale'
      || observation.marketDataStatus === 'unavailable'
      || !finite(current)
      || !finite(alert.threshold_numeric)
      || !alert.operator) {
      return { ...base, observedValue: current, reason: 'missing_data' };
    }
    const matched = numericMatch(alert.operator, current, alert.threshold_numeric, alert.last_observed_value);
    if (!matched) return { ...base, observedValue: current, reason: 'not_matched' };
    if (inCooldown(alert, observation.observedAt)) {
      return { ...base, observedValue: current, reason: 'cooldown' };
    }
    return {
      ...base,
      observedValue: current,
      triggered: true,
      eventKey: `${alert.alert_type}:${alert.operator}:${alert.threshold_numeric}:${observationBucket(observation.observedAt)}`,
      label: `${alert.alert_type} ${alert.operator} ${alert.threshold_numeric}`,
      payload: { operator: alert.operator, threshold: alert.threshold_numeric, observedAt: observation.observedAt },
      reason: 'matched',
    };
  }

  const candidate = candidateSet(alert, observation).find((item) => matchesCandidate(alert, item));
  if (!candidate) return { ...base, reason: 'missing_data' };
  if (!alert.last_evaluated_at && !alert.last_observed_key) {
    return { ...base, observedKey: candidate.key, reason: 'already_seen' };
  }
  if (candidate.key === alert.last_observed_key) {
    return { ...base, observedKey: candidate.key, reason: 'already_seen' };
  }
  if (inCooldown(alert, observation.observedAt)) {
    return { ...base, observedKey: candidate.key, reason: 'cooldown' };
  }
  return candidateEvaluation(alert, candidate);
}

/**
 * Return every matching discrete candidate. Persistence deduplicates candidates
 * by (alert_id, event_key), which remains correct when a source reorders rows or
 * inserts an event behind the previous high-water mark.
 */
export function evaluateWatchlistAlertBatch(
  alert: WatchlistAlert,
  observation: WatchlistAlertObservation,
): WatchlistAlertEvaluation[] {
  if (['price', 'change_pct', 'volume_ratio', 'valuation'].includes(alert.alert_type)) {
    return [evaluateWatchlistAlert(alert, observation)];
  }

  const candidates = candidateSet(alert, observation).filter((candidate) => matchesCandidate(alert, candidate));
  if (candidates.length === 0) return [evaluateWatchlistAlert(alert, observation)];
  if (!alert.last_evaluated_at) {
    return candidates.map((candidate) => candidateBaseline(alert, candidate, 'already_seen'));
  }
  if (inCooldown(alert, observation.observedAt)) {
    return candidates.map((candidate) => candidateBaseline(alert, candidate, 'cooldown'));
  }
  return candidates.map((candidate) => candidateEvaluation(alert, candidate));
}
