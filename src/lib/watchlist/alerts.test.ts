import { describe, expect, it } from 'vitest';
import { parseCreateWatchlistAlert, parseUpdateWatchlistAlert, validateWatchlistAlertUpdate } from './alerts';
import type { WatchlistAlert } from '@/lib/supabase/database.types';

const alert: WatchlistAlert = {
  id: 'alert-1', user_id: 'user-1', watchlist_item_id: 'item-1', alert_type: 'valuation',
  operator: 'gt', threshold_numeric: 30, config: { metric: 'pe_ttm' }, enabled: true,
  cooldown_minutes: 60, last_observed_value: null, last_observed_key: null,
  last_evaluated_at: null, last_triggered_at: null,
  created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z',
};

describe('watchlist alert contracts', () => {
  it('requires thresholds only for numeric alert types', () => {
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'price', operator: 'crosses_above', threshold: 200 }))
      .toMatchObject({ threshold_numeric: 200, cooldown_minutes: 1440, enabled: true });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'event' }))
      .toMatchObject({ operator: null, threshold_numeric: null });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'price' })).toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'price', operator: 'lt', threshold: -1 })).toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'volume_ratio', operator: 'gt', threshold: -2 })).toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'change_pct', operator: 'lt', threshold: -5 }))
      .toMatchObject({ threshold_numeric: -5 });
  });

  it('bounds cooldown and accepts partial updates', () => {
    expect(parseUpdateWatchlistAlert({ enabled: false, cooldownMinutes: 60 }))
      .toEqual({ enabled: false, cooldown_minutes: 60 });
    expect(parseUpdateWatchlistAlert({ cooldownMinutes: 0 })).toBeNull();
    expect(parseUpdateWatchlistAlert({ threshold: null })).toBeNull();
  });

  it('validates structured alert configuration', () => {
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'valuation', operator: 'gt', threshold: 30, config: { metric: 'pb' } }))
      .toMatchObject({ config: { metric: 'pb' } });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'valuation', operator: 'gt', threshold: 30, config: { metric: 'ev' } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'valuation', operator: 'gt', threshold: 30, config: {} }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'event', config: { kinds: [42] } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'price', operator: 'gt', threshold: 2, config: { values: ['x'] } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'lte', threshold: 30, config: { metric: 'rsi14' } }))
      .toMatchObject({ config: { metric: 'rsi14' }, threshold_numeric: 30 });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'lte', threshold: -1, config: { metric: 'rsi14' } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'lt', threshold: -3, config: { metric: 'ma20_distance_pct' } }))
      .toMatchObject({ threshold_numeric: -3 });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'gte', threshold: 80, config: { metric: 'market_relative_strength_percentile' } }))
      .toMatchObject({ config: { metric: 'market_relative_strength_percentile' }, threshold_numeric: 80 });
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'gte', threshold: 101, config: { metric: 'industry_pe_percentile' } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'gte', threshold: -1, config: { metric: 'average_traded_amount_20' } }))
      .toBeNull();
    expect(parseCreateWatchlistAlert({ itemId: 'item-1', alertType: 'metric', operator: 'gte', threshold: 2, config: { metric: 'unknown' } }))
      .toBeNull();
  });

  it('validates an update against the immutable alert type', () => {
    const patch = parseUpdateWatchlistAlert({ config: { metric: 'pb' }, threshold: 4 });
    expect(patch && validateWatchlistAlertUpdate(alert, patch)).toEqual({ config: { metric: 'pb' }, threshold_numeric: 4 });
    const invalid = parseUpdateWatchlistAlert({ config: { values: ['buy'] } });
    expect(invalid && validateWatchlistAlertUpdate(alert, invalid)).toBeNull();
  });
});
