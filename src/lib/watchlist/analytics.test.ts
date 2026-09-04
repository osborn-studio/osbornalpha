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
    expect(metrics.downsideVolatilityPct).toBeGreaterThan(0);
    expect(metrics.sharpeRatio).not.toBeNull();
    expect(metrics.sampleSize).toBe(4);
  });

  it('uses null instead of fabricated zeros when history is unavailable', () => {
    expect(calculateHistoricalWatchlistMetrics([])).toEqual({
      periodReturnPct: null,
      annualizedVolatilityPct: null,
      downsideVolatilityPct: null,
      sharpeRatio: null,
      maxDrawdownPct: null,
      rangePositionPct: null,
      rangeHigh: null,
      rangeLow: null,
      rsi14: null,
      ma20DistancePct: null,
      ma50DistancePct: null,
      benchmarkTicker: null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      beta: null,
      sampleSize: 0,
      methodology: {
        returnBasis: 'price', adjustment: 'none', riskFreeRatePct: 0,
        annualizationFactor: 252, rsiMethod: 'wilder', betaSampleSize: 0,
      },
    });
  });

  it('calculates technical and benchmark-relative metrics on aligned sessions', () => {
    const asset = Array.from({ length: 60 }, (_, index) => bar(index + 1, 100 + index * 1.2));
    const benchmark = Array.from({ length: 60 }, (_, index) => bar(index + 1, 200 + index * 0.8));
    const metrics = calculateHistoricalWatchlistMetrics(asset, { benchmarkBars: benchmark, benchmarkTicker: 'SPY' });
    expect(metrics.benchmarkTicker).toBe('SPY');
    expect(metrics.benchmarkReturnPct).toBeGreaterThan(0);
    expect(metrics.excessReturnPct).toBeGreaterThan(0);
    expect(metrics.beta).not.toBeNull();
    expect(metrics.methodology).toMatchObject({ rsiMethod: 'wilder', betaSampleSize: 59 });
    expect(metrics.rsi14).toBe(100);
    expect(metrics.ma20DistancePct).toBeGreaterThan(0);
    expect(metrics.ma50DistancePct).toBeGreaterThan(0);
  });

  it('aligns benchmark sessions by trading date across timestamp encodings', () => {
    const asset = Array.from({ length: 25 }, (_, index) => bar(Date.UTC(2026, 0, index + 1) / 1_000, 100 + index));
    const benchmark = Array.from({ length: 25 }, (_, index) => ({
      ...bar(index + 1, 200 + index), time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
    const metrics = calculateHistoricalWatchlistMetrics(asset, { benchmarkBars: benchmark, benchmarkTicker: 'SPY' });
    expect(metrics.methodology.betaSampleSize).toBe(24);
    expect(metrics.beta).not.toBeNull();
  });

  it('does not publish beta from an undersized common-session sample', () => {
    const asset = Array.from({ length: 10 }, (_, index) => bar(index + 1, 100 + index));
    const benchmark = Array.from({ length: 10 }, (_, index) => bar(index + 1, 200 + index));
    const metrics = calculateHistoricalWatchlistMetrics(asset, { benchmarkBars: benchmark, benchmarkTicker: 'SPY' });
    expect(metrics.beta).toBeNull();
    expect(metrics.methodology.betaSampleSize).toBe(9);
  });
});
