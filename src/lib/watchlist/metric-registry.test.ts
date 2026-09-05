import { describe, expect, it } from 'vitest';
import { WATCHLIST_OVERVIEW_METRICS } from './overview-fields';
import {
  WATCHLIST_METRIC_DEFINITION_VERSION,
  WATCHLIST_METRIC_KEYS,
  WATCHLIST_METRIC_REGISTRY,
  watchlistMetricDefinition,
} from './metric-registry';

describe('Watchlist metric registry', () => {
  it('is the single ordered source for filterable overview metrics', () => {
    expect(WATCHLIST_OVERVIEW_METRICS).toBe(WATCHLIST_METRIC_KEYS);
    expect(WATCHLIST_METRIC_KEYS).toEqual(Object.keys(WATCHLIST_METRIC_REGISTRY));
    expect(new Set(WATCHLIST_METRIC_KEYS).size).toBe(WATCHLIST_METRIC_KEYS.length);
  });

  it('publishes methodology needed to interpret historical metrics', () => {
    expect(WATCHLIST_METRIC_DEFINITION_VERSION).toMatch(/^watchlist-metrics-/);
    expect(watchlistMetricDefinition('volatility')).toEqual({
      source: 'history', unit: 'percent', direction: 'lower',
      window: 'selected_history', precision: 2, minimumObservations: 20,
    });
    expect(watchlistMetricDefinition('research')).toMatchObject({ source: 'research', window: '14d' });
  });
});
