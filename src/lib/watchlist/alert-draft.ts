import type { WatchlistAlert } from '@/lib/supabase/database.types';
import type { NewWatchlistAlert } from '@/lib/hooks/useWatchlistAlerts';
import { WATCHLIST_ALERT_CATALOG } from './alert-catalog';
import { watchlistMetricAlertThresholdIsValid, type WatchlistMetricAlertKey } from './alert-metrics';
import { WATCHLIST_ALERT_PRESETS, type WatchlistAlertPresetKey } from './alert-presets';

export interface WatchlistAlertDraft {
  type: WatchlistAlert['alert_type'];
  operator: NonNullable<WatchlistAlert['operator']>;
  threshold: string;
  valuationMetric: 'pe_ttm' | 'pb';
  watchlistMetric: WatchlistMetricAlertKey;
  discreteValue: string;
  cooldownMinutes: number;
}

export const DEFAULT_WATCHLIST_ALERT_DRAFT: WatchlistAlertDraft = {
  type: 'price',
  operator: 'crosses_above',
  threshold: '',
  valuationMetric: 'pe_ttm',
  watchlistMetric: 'rsi14',
  discreteValue: '',
  cooldownMinutes: 1440,
};

export function watchlistAlertDraftIsNumeric(draft: WatchlistAlertDraft): boolean {
  return (WATCHLIST_ALERT_CATALOG.numericTypes as readonly string[]).includes(draft.type);
}

export function watchlistAlertDraftIsValid(draft: WatchlistAlertDraft): boolean {
  if (watchlistAlertDraftIsNumeric(draft)) {
    const threshold = Number(draft.threshold);
    return draft.threshold.trim() !== '' && Number.isFinite(threshold)
      && (draft.type !== 'metric' || watchlistMetricAlertThresholdIsValid(draft.watchlistMetric, threshold));
  }
  return draft.type === 'event' || draft.type === 'rating' || draft.type === 'perspective'
    ? !!draft.discreteValue
    : true;
}

export function watchlistAlertDraftInput(draft: WatchlistAlertDraft): NewWatchlistAlert | null {
  if (!watchlistAlertDraftIsValid(draft)) return null;
  const numeric = watchlistAlertDraftIsNumeric(draft);
  return {
    alertType: draft.type,
    operator: numeric ? draft.operator : null,
    threshold: numeric ? Number(draft.threshold) : null,
    config: draft.type === 'valuation' ? { metric: draft.valuationMetric }
      : draft.type === 'metric' ? { metric: draft.watchlistMetric }
        : draft.type === 'event' ? { kinds: [draft.discreteValue] }
          : draft.type === 'rating' || draft.type === 'perspective' ? { values: [draft.discreteValue] }
            : {},
    cooldownMinutes: draft.cooldownMinutes,
  };
}

export function applyWatchlistAlertPreset(
  draft: WatchlistAlertDraft,
  key: WatchlistAlertPresetKey,
): WatchlistAlertDraft {
  const preset = WATCHLIST_ALERT_PRESETS.find((item) => item.key === key);
  if (!preset) return draft;
  return {
    ...draft,
    type: preset.type,
    operator: preset.operator,
    threshold: preset.threshold,
    discreteValue: preset.discreteValue,
    ...(preset.metric ? { watchlistMetric: preset.metric } : {}),
  };
}
