import { describe, expect, it } from 'vitest';
import type { KlineBar } from '@/lib/chart/kline';
import { calculateHistoricalWatchlistMetrics } from './analytics';

function bar(time: number, close: number, high = close, low = close): KlineBar {
  return { time, open: close, high, low, close, volume: 100, previousClose: null, change: null, changePct: null };
}

describe('calculateHistoricalWatchlistMetrics', () => {
  it('calculates price return, drawdown and range position from honest bar data', () => {
    const metrics = calculateHistoricalWatchlistMetrics([
      bar(1, 100, 102, 98),
      bar(2, 120, 122, 110),
      bar(3, 90, 94, 88),
      bar(4, 110, 112, 105),
    ]);

    expect(metrics.periodReturnPct).toBeCloseTo(10);
    expect(metrics.maxDrawdownPct).toBeCloseTo(25);
    expect(metrics.rangeHigh).toBe(122);
    expect(metrics.rangeLow).toBe(88);
    expect(metrics.rangePositionPct).toBeCloseTo(64.7059);
    expect(metrics.annualizedVolatilityPct).toBeGreaterThan(0);
  });

  it('uses null instead of fabricated zeros when history is unavailable', () => {
    expect(calculateHistoricalWatchlistMetrics([])).toEqual({
      periodReturnPct: null,
      annualizedVolatilityPct: null,
      maxDrawdownPct: null,
      rangePositionPct: null,
      rangeHigh: null,
      rangeLow: null,
    });
  });
});
