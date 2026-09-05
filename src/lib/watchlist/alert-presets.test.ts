import { describe, expect, it } from 'vitest';
import { alertThresholdUnit, WATCHLIST_ALERT_PRESETS } from './alert-presets';

describe('watchlist alert presets', () => {
  it('provides valid starter rules without hiding editable fields', () => {
    expect(WATCHLIST_ALERT_PRESETS.map((preset) => preset.key)).toEqual([
      'priceAbove', 'priceBelow', 'largeMove', 'unusualVolume', 'rsiOversold', 'volatilityHigh', 'ratingBuy',
    ]);
    expect(WATCHLIST_ALERT_PRESETS.find((preset) => preset.key === 'unusualVolume')).toMatchObject({ type: 'volume_ratio', threshold: '2' });
    expect(WATCHLIST_ALERT_PRESETS.find((preset) => preset.key === 'rsiOversold')).toMatchObject({
      type: 'metric', metric: 'rsi14', threshold: '30',
    });
  });

  it('labels dimensioned numeric thresholds', () => {
    expect(alertThresholdUnit('change_pct')).toBe('%');
    expect(alertThresholdUnit('volume_ratio')).toBe('x');
    expect(alertThresholdUnit('price')).toBeNull();
  });
});
