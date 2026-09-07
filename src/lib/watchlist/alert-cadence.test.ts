import { describe, expect, it } from 'vitest';
import {
  watchlistAlertCadence,
  watchlistAlertUsesDiscreteCrossing,
} from './alert-cadence';

describe('Watchlist alert cadence', () => {
  it('describes the actual scheduler cadence for each alert family', () => {
    expect(watchlistAlertCadence({ alert_type: 'price' })).toBe('market_15m');
    expect(watchlistAlertCadence({ alert_type: 'valuation' })).toBe('market_15m');
    expect(watchlistAlertCadence({ alert_type: 'metric' })).toBe('hourly');
    expect(watchlistAlertCadence({ alert_type: 'event' })).toBe('daily');
  });

  it('only labels crossing operators as discrete observations', () => {
    expect(watchlistAlertUsesDiscreteCrossing({ operator: 'crosses_above' })).toBe(true);
    expect(watchlistAlertUsesDiscreteCrossing({ operator: 'gte' })).toBe(false);
    expect(watchlistAlertUsesDiscreteCrossing({ operator: null })).toBe(false);
  });
});
