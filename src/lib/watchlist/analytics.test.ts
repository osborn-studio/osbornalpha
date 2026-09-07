import { describe, expect, it } from 'vitest';
import type { KlineBar } from '@/lib/chart/kline';
import { calculateHistoricalWatchlistMetrics, sampleWatchlistSparkline, tradingDaysPerYear, watchlistAnnualizationFactor } from './analytics';

function bar(time: number, close: number, high = close, low = close, volume: number | undefined = 100): KlineBar {
  return { time, open: close, high, low, close, volume, previousClose: null, change: null, changePct: null };
}

describe('calculateHistoricalWatchlistMetrics', () => {
  it('samples a chronological sparkline while preserving both endpoints', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    const sampled = sampleWatchlistSparkline(values);
    expect(sampled).toHaveLength(24);
    expect(sampled[0]).toBe(1);
    expect(sampled.at(-1)).toBe(100);
  });

  it('uses the selected market calendar for annualised risk metrics', () => {
    expect(tradingDaysPerYear('US')).toBe(252);
    expect(tradingDaysPerYear('A')).toBe(244);
    const bars = Array.from({ length: 30 }, (_, index) => bar(index + 1, 100 + index));
    const us = calculateHistoricalWatchlistMetrics(bars, { market: 'US' });
    const aShare = calculateHistoricalWatchlistMetrics(bars, { market: 'A' });
    expect(us.methodology.annualizationFactor).toBe(252);
    expect(aShare.methodology.annualizationFactor).toBe(244);
    expect(aShare.annualizedVolatilityPct).toBeLessThan(us.annualizedVolatilityPct!);
  });

  it('annualizes weekly and monthly history using their observation frequency', () => {
    expect(watchlistAnnualizationFactor('US', '5y')).toBe(52);
    expect(watchlistAnnualizationFactor('US', 'all')).toBe(12);
    expect(calculateHistoricalWatchlistMetrics([], { market: 'US', historyRange: '5y' }).methodology.annualizationFactor).toBe(52);
    expect(calculateHistoricalWatchlistMetrics([], { market: 'US', historyRange: 'all' }).methodology.annualizationFactor).toBe(12);
  });

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
    expect(metrics.observations).toBe(4);
    expect(metrics.usableObservations).toBe(4);
    expect(metrics.coverageRatio).toBe(1);
    expect(metrics.coverageStart).toBe('1');
    expect(metrics.coverageEnd).toBe('4');
  });

  it('uses null instead of fabricated zeros when history is unavailable', () => {
    expect(calculateHistoricalWatchlistMetrics([])).toEqual({
      periodReturnPct: null,
      totalReturnPct: null,
      distributionContributionPct: null,
      dividendCount: 0,
      splitCount: 0,
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
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      bollingerPositionPct: null,
      atr14Pct: null,
      volumeZScore20: null,
      averageTradedAmount20: null,
      averageTradedAmountSampleSize: 0,
      correlationSeries: [],
      benchmarkTicker: null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      benchmarkTotalReturnPct: null,
      excessTotalReturnPct: null,
      beta: null,
      observations: 0,
      usableObservations: 0,
      coverageRatio: 0,
      coverageStart: null,
      coverageEnd: null,
      benchmarkObservations: 0,
      benchmarkAlignedObservations: 0,
      benchmarkAlignmentRatio: null,
      benchmarkStatus: 'unavailable',
      sampleSize: 0,
      sparkline: [],
      methodology: {
        returnBasis: 'price', historyRange: '1y', priceReturnSource: null,
        totalReturnBasis: 'unavailable', adjustment: 'none', riskFreeRatePct: 0,
        annualizationFactor: 252, rsiMethod: 'wilder', betaSampleSize: 0,
      },
    });
  });

  it('uses one return source for price, total, distribution, and benchmark comparisons', () => {
    const bars = Array.from({ length: 30 }, (_, index) => bar(index + 1, 100 + index));
    const snapshot = {
      ticker: 'AAPL', market: 'US' as const, range: '6m' as const, source: 'yahoo-chart', currency: 'USD',
      priceReturnPct: 8, totalReturnPct: 9.25, distributionContributionPct: 1.25,
      dividendCount: 2, splitCount: 0, coverageStart: '2026-01-01', coverageEnd: '2026-06-30', asOf: '2026-06-30',
      methodology: { priceBasis: 'unadjusted_close' as const, totalReturnBasis: 'adjusted_close_reinvestment' as const }, warnings: [],
    };
    const benchmark = { ...snapshot, ticker: 'SPY', priceReturnPct: 5, totalReturnPct: 5.5, distributionContributionPct: 0.5 };
    const metrics = calculateHistoricalWatchlistMetrics(bars, {
      historyRange: '6m', returnSnapshot: snapshot, benchmarkReturnSnapshot: benchmark,
    });
    expect(metrics).toMatchObject({
      periodReturnPct: 8, totalReturnPct: 9.25, distributionContributionPct: 1.25,
      benchmarkReturnPct: 5, excessReturnPct: 3,
      benchmarkTotalReturnPct: 5.5, excessTotalReturnPct: 3.75,
      dividendCount: 2, splitCount: 0,
      methodology: { historyRange: '6m', priceReturnSource: 'yahoo-chart', totalReturnBasis: 'adjusted_close_reinvestment' },
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
    expect(metrics.benchmarkAlignedObservations).toBe(60);
    expect(metrics.benchmarkAlignmentRatio).toBe(1);
    expect(metrics.rsi14).toBe(100);
    expect(metrics.ma20DistancePct).toBeGreaterThan(0);
    expect(metrics.ma50DistancePct).toBeGreaterThan(0);
  });

  it('calculates MACD, Bollinger position, and ATR from sufficient history', () => {
    const bars = Array.from({ length: 80 }, (_, index) => {
      const close = 100 + index * 0.35 + Math.sin(index / 3);
      return bar(index + 1, close, close + 2, close - 2);
    });
    const metrics = calculateHistoricalWatchlistMetrics(bars, { market: 'US' });
    expect(metrics.macd).not.toBeNull();
    expect(metrics.macdSignal).not.toBeNull();
    expect(metrics.macdHistogram).not.toBeNull();
    expect(metrics.bollingerPositionPct).toBeGreaterThanOrEqual(0);
    expect(metrics.bollingerPositionPct).toBeLessThanOrEqual(100);
    expect(metrics.atr14Pct).toBeGreaterThan(0);
  });

  it('measures the latest volume against the preceding 20 sessions', () => {
    const bars = Array.from({ length: 20 }, (_, index) => bar(index + 1, 100 + index, undefined, undefined, 90 + index));
    bars.push(bar(21, 121, undefined, undefined, 250));
    expect(calculateHistoricalWatchlistMetrics(bars).volumeZScore20).toBeGreaterThan(10);
  });

  it('returns zero for unchanged volume and null when the comparison window is incomplete', () => {
    const flat = Array.from({ length: 21 }, (_, index) => bar(index + 1, 100 + index, undefined, undefined, 100));
    expect(calculateHistoricalWatchlistMetrics(flat).volumeZScore20).toBe(0);
    flat[5] = { ...bar(6, 105), volume: Number.NaN };
    expect(calculateHistoricalWatchlistMetrics(flat).volumeZScore20).toBeNull();
  });

  it('uses only provider-reported turnover for the 20-session liquidity average', () => {
    const complete = Array.from({ length: 20 }, (_, index) => ({
      ...bar(index + 1, 100 + index), amount: 1_000 + index * 10,
    }));
    const metrics = calculateHistoricalWatchlistMetrics(complete);
    expect(metrics.averageTradedAmount20).toBeCloseTo(1_095);
    expect(metrics.averageTradedAmountSampleSize).toBe(20);

    const incomplete = complete.map((item, index) => index === 3 ? { ...item, amount: null } : item);
    const missing = calculateHistoricalWatchlistMetrics(incomplete);
    expect(missing.averageTradedAmount20).toBeNull();
    expect(missing.averageTradedAmountSampleSize).toBe(19);
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

  it('keeps a bounded dated return series for honest pairwise correlation', () => {
    const bars = Array.from({ length: 80 }, (_, index) => bar(index + 1, 100 + index));
    const series = calculateHistoricalWatchlistMetrics(bars).correlationSeries;
    expect(series).toHaveLength(60);
    expect(series[0].date).toBe('21');
    expect(series.at(-1)?.date).toBe('80');
    expect(series.every((item) => Number.isFinite(item.returnPct))).toBe(true);
  });

  it('does not publish beta from an undersized common-session sample', () => {
    const asset = Array.from({ length: 10 }, (_, index) => bar(index + 1, 100 + index));
    const benchmark = Array.from({ length: 10 }, (_, index) => bar(index + 1, 200 + index));
    const metrics = calculateHistoricalWatchlistMetrics(asset, { benchmarkBars: benchmark, benchmarkTicker: 'SPY' });
    expect(metrics.beta).toBeNull();
    expect(metrics.methodology.betaSampleSize).toBe(9);
    expect(metrics.benchmarkStatus).toBe('limited');
  });
});
