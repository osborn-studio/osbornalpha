import type { WatchlistAlert } from '@/lib/supabase/database.types';
import {
  WATCHLIST_ALERT_OPERATORS,
  WATCHLIST_ALERT_TYPES,
  WATCHLIST_EVENT_KINDS,
  WATCHLIST_NUMERIC_ALERT_TYPES,
  WATCHLIST_PERSPECTIVE_VALUES,
  WATCHLIST_RATING_VALUES,
  WATCHLIST_VALUATION_METRICS,
} from './alert-catalog';
import {
  isWatchlistMetricAlertKey,
  watchlistMetricAlertThresholdIsValid,
} from './alert-metrics';

const ALERT_TYPES = new Set<WatchlistAlert['alert_type']>(WATCHLIST_ALERT_TYPES);
const OPERATORS = new Set<NonNullable<WatchlistAlert['operator']>>(WATCHLIST_ALERT_OPERATORS);
const NUMERIC_ALERTS = new Set<WatchlistAlert['alert_type']>(WATCHLIST_NUMERIC_ALERT_TYPES);

export interface CreateWatchlistAlert {
  watchlist_item_id: string;
  alert_type: WatchlistAlert['alert_type'];
  operator: WatchlistAlert['operator'];
  threshold_numeric: number | null;
  config: Record<string, unknown>;
  enabled: boolean;
  cooldown_minutes: number;
}

function validConfig(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try { return JSON.stringify(value).length <= 4_000; } catch { return false; }
}

function validStringList(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 20
    && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 80);
}

function validEnumeratedList(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (validStringList(value) && (value as string[]).every((item) => allowed.includes(item)));
}

function validAlertConfig(type: WatchlistAlert['alert_type'], config: Record<string, unknown>): boolean {
  const allowed = type === 'valuation' || type === 'metric' ? ['metric']
    : type === 'event' ? ['kinds']
      : type === 'rating' || type === 'perspective' ? ['values']
        : [];
  if (Object.keys(config).some((key) => !allowed.includes(key))) return false;
  if (type === 'valuation' && !WATCHLIST_VALUATION_METRICS.includes(config.metric as never)) return false;
  if (type === 'metric' && !isWatchlistMetricAlertKey(config.metric)) return false;
  if (type === 'event' && !validEnumeratedList(config.kinds, WATCHLIST_EVENT_KINDS)) return false;
  if (type === 'rating' && !validEnumeratedList(config.values, WATCHLIST_RATING_VALUES)) return false;
  if (type === 'perspective' && !validEnumeratedList(config.values, WATCHLIST_PERSPECTIVE_VALUES)) return false;
  return true;
}

function validNumericThreshold(
  type: WatchlistAlert['alert_type'],
  value: unknown,
  config: Record<string, unknown>,
): value is number {
  if (type === 'metric') return watchlistMetricAlertThresholdIsValid(config.metric, value);
  if (!finiteThreshold(value) || Math.abs(value) > 1_000_000_000_000_000) return false;
  return type === 'change_pct' || value >= 0;
}

function validRule(
  type: WatchlistAlert['alert_type'],
  operator: WatchlistAlert['operator'],
  threshold: number | null,
  config: Record<string, unknown>,
): boolean {
  if (!validAlertConfig(type, config)) return false;
  if (NUMERIC_ALERTS.has(type)) return !!operator && OPERATORS.has(operator) && validNumericThreshold(type, threshold, config);
  return operator === null && threshold === null;
}

function finiteThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseCreateWatchlistAlert(body: unknown): CreateWatchlistAlert | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.itemId !== 'string' || !input.itemId.trim()) return null;
  if (typeof input.alertType !== 'string' || !ALERT_TYPES.has(input.alertType as WatchlistAlert['alert_type'])) return null;
  const alertType = input.alertType as WatchlistAlert['alert_type'];
  const operator = input.operator == null ? null : input.operator;
  const threshold = input.threshold == null ? null : input.threshold;
  const config = input.config ?? {};
  if (!validConfig(config) || !validAlertConfig(alertType, config)) return null;
  if (NUMERIC_ALERTS.has(alertType)) {
    if (typeof operator !== 'string' || !OPERATORS.has(operator as NonNullable<WatchlistAlert['operator']>)) return null;
    if (!validNumericThreshold(alertType, threshold, config)) return null;
  } else if (operator !== null || threshold !== null) {
    return null;
  }
  const cooldown = input.cooldownMinutes ?? 1440;
  if (!Number.isInteger(cooldown) || Number(cooldown) < 1 || Number(cooldown) > 10080) return null;
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') return null;
  return {
    watchlist_item_id: input.itemId.trim(),
    alert_type: alertType,
    operator: operator as WatchlistAlert['operator'],
    threshold_numeric: threshold as number | null,
    config,
    enabled: input.enabled !== false,
    cooldown_minutes: Number(cooldown),
  };
}

export type UpdateWatchlistAlert = Partial<Pick<WatchlistAlert, 'enabled' | 'cooldown_minutes' | 'operator' | 'threshold_numeric' | 'config'>>;

export function parseUpdateWatchlistAlert(body: unknown): UpdateWatchlistAlert | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const patch: Partial<Pick<WatchlistAlert, 'enabled' | 'cooldown_minutes' | 'operator' | 'threshold_numeric' | 'config'>> = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return null;
    patch.enabled = input.enabled;
  }
  if (input.cooldownMinutes !== undefined) {
    if (!Number.isInteger(input.cooldownMinutes) || Number(input.cooldownMinutes) < 1 || Number(input.cooldownMinutes) > 10080) return null;
    patch.cooldown_minutes = Number(input.cooldownMinutes);
  }
  if (input.operator !== undefined) {
    if (typeof input.operator !== 'string' || !OPERATORS.has(input.operator as NonNullable<WatchlistAlert['operator']>)) return null;
    patch.operator = input.operator as WatchlistAlert['operator'];
  }
  if (input.threshold !== undefined) {
    if (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold)) return null;
    patch.threshold_numeric = input.threshold as number | null;
  }
  if (input.config !== undefined) {
    if (!validConfig(input.config)) return null;
    patch.config = input.config;
  }
  return Object.keys(patch).length ? patch : null;
}

export function validateWatchlistAlertUpdate(
  current: WatchlistAlert,
  patch: UpdateWatchlistAlert,
): UpdateWatchlistAlert | null {
  const operator = patch.operator === undefined ? current.operator : patch.operator;
  const threshold = patch.threshold_numeric === undefined ? current.threshold_numeric : patch.threshold_numeric;
  const config = patch.config === undefined ? current.config : patch.config;
  return validRule(current.alert_type, operator, threshold, config) ? patch : null;
}
