import { describe, expect, it } from 'vitest';
import type { RadarPayload } from '@/lib/brief/radar';
import { observationFromRadar } from './alert-observation';

function radar(updatedAt: string): RadarPayload {
  return {
    ticker: 'AAPL', market: 'US', as_of: '2026-09-04T15:00:00Z',
    sections: {
      price: { value: 200, change_pct: 1, currency: '$', pe_ttm: 25, pb: 4, market_cap_label: '--', source: 'test', updated_at: updatedAt },
      calendar: { upcoming: [] },
    },
  } as unknown as RadarPayload;
}

describe('alert market observation freshness', () => {
  it('accepts a recent quote while the US market is open', () => {
    const result = observationFromRadar(radar('2026-09-04T14:55:00Z'), [], [], new Date('2026-09-04T15:00:00Z'));
    expect(result.marketDataStatus).toBe('fresh');
    expect(result.observedAt).toBe('2026-09-04T14:55:00Z');
  });

  it('marks an old quote stale while the US market is open', () => {
    const result = observationFromRadar(radar('2026-09-04T13:00:00Z'), [], [], new Date('2026-09-04T15:00:00Z'));
    expect(result.marketDataStatus).toBe('stale');
  });
});
