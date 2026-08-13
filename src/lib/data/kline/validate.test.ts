import { describe, expect, it } from 'vitest';
import { assertCompatibleSeries, validateKlineSeries } from './validate';
import type { SourceKlineSeries } from './types';

function series(bars: SourceKlineSeries['bars']): SourceKlineSeries {
  return { source: 'eastmoney', adjustment: 'qfq', volumeUnit: 'shares', bars };
}

describe('K-line validation', () => {
  it('sorts, de-duplicates identical bars and reports partial coverage', () => {
    const bar = { time: '2026-08-11', open: 10, high: 12, low: 9, close: 11, volume: 100 };
    const result = validateKlineSeries(series([
      bar,
      { time: '2026-08-10', open: 9, high: 11, low: 8, close: 10, volume: 90 },
      { ...bar },
    ]), 'qfq', 5);
    expect(result.bars.map((item) => item.time)).toEqual(['2026-08-10', '2026-08-11']);
    expect(result.completeness).toBe('partial');
  });

  it('rejects invalid OHLC and conflicting duplicate bars', () => {
    expect(() => validateKlineSeries(series([
      { time: '2026-08-11', open: 10, high: 9, low: 8, close: 11, volume: 100 },
    ]), 'qfq', 1)).toThrow(/OHLC/);
    expect(() => validateKlineSeries(series([
      { time: '2026-08-11', open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: '2026-08-11', open: 10, high: 13, low: 9, close: 11, volume: 100 },
    ]), 'qfq', 2)).toThrow(/Conflicting duplicate/);
  });

  it('rejects syntactically plausible but impossible calendar values', () => {
    expect(() => validateKlineSeries(series([
      { time: '2026-02-31', open: 10, high: 12, low: 9, close: 11, volume: 100 },
    ]), 'qfq', 1)).toThrow(/calendar date/);
    expect(() => validateKlineSeries(series([
      { time: '2026-08-11 24:00:00', open: 10, high: 12, low: 9, close: 11, volume: 100 },
    ]), 'qfq', 1)).toThrow(/clock time/);
  });

  it('rejects mixed timestamp granularity and non-normalized volume units', () => {
    expect(() => validateKlineSeries(series([
      { time: '2026-08-10', open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: '2026-08-11 09:30:00', open: 11, high: 13, low: 10, close: 12, volume: 100 },
    ]), 'qfq', 2)).toThrow(/mixes daily and intraday/);
    expect(() => validateKlineSeries({ ...series([]), volumeUnit: 'lots' as never }, 'qfq', 1)).toThrow(/normalized to shares/);
  });

  it('blocks a fallback whose overlapping prices use a different scale', () => {
    const oldBars = Array.from({ length: 6 }, (_, index) => ({
      time: `2026-08-${String(index + 1).padStart(2, '0')}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 1_000,
    }));
    const nextBars = oldBars.map((bar) => ({ ...bar, open: bar.open * 10, high: bar.high * 10, low: bar.low * 10, close: bar.close * 10 }));
    expect(() => assertCompatibleSeries(series(nextBars), series(oldBars))).toThrow(/conflicts/);
  });
});
