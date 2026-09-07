import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATCHLIST_ALERT_DRAFT,
  applyWatchlistAlertPreset,
  watchlistAlertDraftInput,
  watchlistAlertDraftIsValid,
} from './alert-draft';

describe('Watchlist alert draft', () => {
  it('builds numeric and discrete API inputs', () => {
    expect(watchlistAlertDraftInput({ ...DEFAULT_WATCHLIST_ALERT_DRAFT, threshold: '125.5' })).toEqual({
      alertType: 'price', operator: 'crosses_above', threshold: 125.5, config: {}, cooldownMinutes: 1440,
    });
    expect(watchlistAlertDraftInput({
      ...DEFAULT_WATCHLIST_ALERT_DRAFT, type: 'rating', discreteValue: 'buy',
    })).toEqual({
      alertType: 'rating', operator: null, threshold: null, config: { values: ['buy'] }, cooldownMinutes: 1440,
    });
  });

  it('shares metric threshold validation with the alert domain', () => {
    expect(watchlistAlertDraftIsValid({
      ...DEFAULT_WATCHLIST_ALERT_DRAFT, type: 'metric', watchlistMetric: 'rsi14', threshold: '101',
    })).toBe(false);
  });

  it('applies existing presets without resetting cooldown preferences', () => {
    expect(applyWatchlistAlertPreset({
      ...DEFAULT_WATCHLIST_ALERT_DRAFT, cooldownMinutes: 60,
    }, 'rsiOversold')).toMatchObject({
      type: 'metric', watchlistMetric: 'rsi14', threshold: '30', cooldownMinutes: 60,
    });
  });
});
