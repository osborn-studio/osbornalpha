import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decorateCachedResolution,
  klineProviderRoute,
  KlineReliabilityEngine,
  KlineResolutionError,
  type KlineResolution,
} from './reliability';
import { KlineProviderError, type KlineProvider, type SourceKlineBar } from './types';

const NOW = new Date('2026-08-15T12:00:00Z');

const dayString = (offsetDays: number): string =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Daily bars ending yesterday; enough depth to keep 1M windows complete. */
const completeBars = (count = 40): SourceKlineBar[] => Array.from({ length: count }, (_, index) => ({
  time: dayString(index - count),
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  volume: 1_000 + index,
}));

function provider(
  name: KlineProvider['name'],
  fetch: KlineProvider['fetch'],
  maxAttempts = 1,
): KlineProvider {
  return { name, market: 'US', adjustment: 'none', timeoutMs: 1_000, maxAttempts, fetch };
}

describe('KlineReliabilityEngine', () => {
  it('retries transient failures and records jittered backoff', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new KlineProviderError('transient', 'timeout', true))
      .mockResolvedValue({ source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: completeBars() });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const engine = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', fetch, 2)],
      now: () => NOW,
      random: () => 0.5,
      sleep,
    });

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(result).toMatchObject({ source: 'eastmoney', freshness: 'fresh', fallbackUsed: false });
  });

  it('falls back without changing adjustment semantics', async () => {
    const primary = provider('eastmoney', vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down')));
    const secondary = provider('sina', vi.fn().mockResolvedValue({ source: 'sina', adjustment: 'none', volumeUnit: 'shares', bars: completeBars() }));
    const engine = new KlineReliabilityEngine({ providersFor: () => [primary, secondary], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(result).toMatchObject({ source: 'sina', fallbackUsed: true, warnings: ['fallback_used'] });
  });

  it('defines 1D as the latest trading session instead of a cross-day bar count', async () => {
    const bars: SourceKlineBar[] = [
      { time: '2026-08-10 15:58:00', open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { time: '2026-08-10 15:59:00', open: 100, high: 102, low: 99, close: 101, volume: 10 },
      { time: '2026-08-11 09:30:00', open: 102, high: 103, low: 101, close: 102, volume: 10 },
      { time: '2026-08-11 09:31:00', open: 102, high: 104, low: 101, close: 103, volume: 10 },
    ];
    const intraday = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'intraday', volumeUnit: 'shares', bars }));
    intraday.adjustment = 'intraday';
    intraday.returnsInterval = 'minute';
    const engine = new KlineReliabilityEngine({ providersFor: () => [intraday], now: () => NOW });
    const result = await engine.resolve({ ticker: 'NVDA', range: '1d' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-08-11 09:30:00', '2026-08-11 09:31:00']);
    expect(result.previousClose).toBe(101);
    expect(result.completeness).toBe('partial');
  });

  it('keeps five sessions for 5D and anchors the previous close on the prior session', async () => {
    const bars: SourceKlineBar[] = [
      { time: '2026-08-06 09:30:00', open: 90, high: 91, low: 89, close: 90, volume: 10 },
      { time: '2026-08-07 09:30:00', open: 91, high: 92, low: 90, close: 91, volume: 10 },
      { time: '2026-08-10 09:30:00', open: 92, high: 93, low: 91, close: 92, volume: 10 },
      { time: '2026-08-11 09:30:00', open: 93, high: 94, low: 92, close: 93, volume: 10 },
      { time: '2026-08-12 09:30:00', open: 94, high: 95, low: 93, close: 94, volume: 10 },
      { time: '2026-08-13 09:30:00', open: 95, high: 96, low: 94, close: 95, volume: 10 },
      { time: '2026-08-14 09:30:00', open: 96, high: 97, low: 95, close: 96, volume: 10 },
    ];
    const intraday = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'intraday', volumeUnit: 'shares', bars }));
    intraday.adjustment = 'intraday';
    intraday.returnsInterval = 'minute';
    intraday.returnsGranularity = '5m';
    const engine = new KlineReliabilityEngine({ providersFor: () => [intraday], now: () => NOW });
    const result = await engine.resolve({ ticker: 'NVDA', range: '5d' });
    expect(result.bars.map((bar) => bar.time.slice(0, 10))).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    ]);
    expect(result.previousClose).toBe(91);
  });

  it('resamples one-minute providers onto the 5D five-minute grid', async () => {
    const minute: SourceKlineBar[] = [];
    for (let index = 0; index < 10; index += 1) {
      const minuteOfDay = 30 + index;
      minute.push({
        time: `2026-08-14 09:${String(minuteOfDay).padStart(2, '0')}:00`,
        open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 10, amount: 1_000,
      });
    }
    const wind = provider('datagateway', vi.fn().mockResolvedValue({ source: 'datagateway', adjustment: 'intraday', volumeUnit: 'shares', bars: minute }));
    wind.adjustment = 'intraday';
    wind.returnsInterval = 'minute';
    wind.returnsGranularity = '1m';
    const engine = new KlineReliabilityEngine({ providersFor: () => [wind], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '5d' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-08-14 09:30', '2026-08-14 09:35']);
    expect(result.bars[0]).toMatchObject({ open: 100, high: 105, low: 99, close: 104, volume: 50, amount: 5_000 });
    expect(result.availableBars).toBe(2);
  });

  it('honors an explicit adjustment selection end to end', async () => {
    const history = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'hfq', volumeUnit: 'shares', bars: completeBars(),
    }));
    history.adjustment = 'hfq';
    const engine = new KlineReliabilityEngine({ providersFor: () => [history], now: () => NOW });

    const result = await engine.resolve({ ticker: '600519.SH', range: '1m', adjustment: 'hfq' });
    expect(result.adjustment).toBe('hfq');
  });

  it('anchors YTD daily history at the market-local calendar year', async () => {
    const history = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: [
        { time: '2025-12-31', open: 99, high: 100, low: 98, close: 99, volume: 10 },
        { time: '2026-01-02', open: 100, high: 101, low: 99, close: 100, volume: 10 },
        { time: '2026-08-14', open: 101, high: 102, low: 100, close: 101, volume: 10 },
      ],
    }));
    history.returnsInterval = 'day';
    const engine = new KlineReliabilityEngine({ providersFor: () => [history], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: 'ytd' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-01-02', '2026-08-14']);
    expect(result.previousClose).toBe(99);
  });

  it('drops off-session auction bars before selecting the trading sessions', async () => {
    const bars: SourceKlineBar[] = [
      { time: '2026-08-14 09:25:00', open: 99, high: 99, low: 99, close: 99, volume: 10 },
      { time: '2026-08-14 09:30:00', open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { time: '2026-08-14 16:08:00', open: 101, high: 102, low: 101, close: 102, volume: 10 },
    ];
    const intraday = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'intraday', volumeUnit: 'shares', bars }));
    intraday.adjustment = 'intraday';
    intraday.returnsInterval = 'minute';
    const engine = new KlineReliabilityEngine({ providersFor: () => [intraday], now: () => NOW });
    const result = await engine.resolve({ ticker: 'NVDA', range: '1d' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-08-14 09:30:00']);
  });

  it('keeps the most recent completed 1D session on a non-trading day', async () => {
    const intraday = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'intraday', volumeUnit: 'shares',
      bars: [
        { time: '2026-08-28 15:58:00', open: 100, high: 101, low: 99, close: 100, volume: 10 },
        { time: '2026-08-28 15:59:00', open: 100, high: 102, low: 99, close: 101, volume: 10 },
      ],
    }));
    intraday.adjustment = 'intraday';
    intraday.returnsInterval = 'minute';
    const engine = new KlineReliabilityEngine({
      providersFor: () => [intraday],
      now: () => new Date('2026-08-29T15:00:00Z'),
    });
    const result = await engine.resolve({ ticker: 'NVDA', range: '1d' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-08-28 15:58:00', '2026-08-28 15:59:00']);
    expect(result.freshness).toBe('fresh');
    expect(result.partial).toBe(false);
  });

  it('trims the 1M window to the calendar range and audits the previous close', async () => {
    // 55 daily bars ending yesterday; only the last 31 calendar days are visible.
    const history = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: completeBars(55),
    }));
    const engine = new KlineReliabilityEngine({ providersFor: () => [history], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(result.bars[0].time).toBe('2026-07-15');
    expect(result.bars).toHaveLength(31);
    expect(result.bars[result.bars.length - 1].time).toBe('2026-08-14');
    expect(result.previousClose).toBe(124);
    expect(result.completeness).toBe('complete');
  });

  it('delivers MA warmup closes ahead of the visible daily window', async () => {
    const history = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: completeBars(55),
    }));
    const engine = new KlineReliabilityEngine({ providersFor: () => [history], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(result.warmupCloses).toHaveLength(20);
    expect(result.warmupCloses[0]).toBe(105);
    expect(result.warmupCloses[19]).toBe(124);
  });

  it('marks a suspension that empties the calendar window without failing', async () => {
    // All bars are older than the 1M calendar window.
    const stale = provider('eastmoney', vi.fn().mockResolvedValue({
      source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: completeBars(40).map((bar, index) => ({
        ...bar,
        time: new Date(Date.parse('2026-04-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      })),
    }));
    const engine = new KlineReliabilityEngine({ providersFor: () => [stale], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(result.bars).toHaveLength(0);
    expect(result.availableBars).toBeGreaterThan(0);
    expect(result.asOfFallback).toBe('2026-05-10');
  });

  it('aggregates daily fallback history into weekly candles for 5Y', async () => {
    // Three trading weeks: 2026-07-27, 2026-08-03, 2026-08-10 (Mondays).
    const daily: SourceKlineBar[] = [];
    for (let day = 0; day < 19; day += 1) {
      const time = new Date(Date.parse('2026-07-27T00:00:00Z') + day * 86_400_000).toISOString().slice(0, 10);
      daily.push({ time, open: 100 + day, high: 102 + day, low: 99 + day, close: 101 + day, volume: 100 });
    }
    const fallback = provider('sina', vi.fn().mockResolvedValue({ source: 'sina', adjustment: 'none', volumeUnit: 'shares', bars: daily }));
    fallback.returnsInterval = 'day';
    const engine = new KlineReliabilityEngine({ providersFor: () => [fallback], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '5y' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10']);
    expect(result.bars[0]).toMatchObject({ open: 100, high: 108, low: 99, close: 107, volume: 700 });
    expect(result.completeness).toBe('partial');
    expect(result.previousClose).toBeNull();
    // NOW is a Saturday inside the 2026-08-10 week: the last weekly bar is
    // still forming even though the market is closed.
    expect(result.partial).toBe(true);
    expect(result.warnings).toContain('partial_bar');
  });

  it('passes native weekly bars through without re-aggregating', async () => {
    const weekly: SourceKlineBar[] = [
      { time: '2026-08-03', open: 10, high: 12, low: 9, close: 11, volume: 500 },
      { time: '2026-08-10', open: 11, high: 13, low: 10, close: 12, volume: 600 },
    ];
    const native = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: weekly }));
    native.returnsInterval = 'week';
    const engine = new KlineReliabilityEngine({ providersFor: () => [native], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: '5y' });
    expect(result.bars).toEqual(weekly);
    expect(result.previousClose).toBeNull();
  });

  it('marks All complete when the aggregated fallback exhausts provider history', async () => {
    // 40 daily bars (07-06..08-14) are far below the 1800-bar fetch cap, so
    // the aggregated monthly series is everything the provider has.
    const fallback = provider('sina', vi.fn().mockResolvedValue({ source: 'sina', adjustment: 'none', volumeUnit: 'shares', bars: completeBars(40) }));
    fallback.returnsInterval = 'day';
    const engine = new KlineReliabilityEngine({ providersFor: () => [fallback], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: 'all' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-07-01', '2026-08-01']);
    expect(result.completeness).toBe('complete');
    expect(result.warnings).not.toContain('partial_coverage');
    // NOW (Saturday 2026-08-15) sits in the 2026-08 bucket: forming monthly bar.
    expect(result.partial).toBe(true);
  });

  it('flags All as partial when the aggregated fallback hits the daily fetch cap', async () => {
    const daily = Array.from({ length: 2_000 }, (_, index) => ({
      time: dayString(index - 2_000),
      open: 100, high: 101, low: 99, close: 100, volume: 10,
    }));
    const fallback = provider('sina', vi.fn().mockResolvedValue({ source: 'sina', adjustment: 'none', volumeUnit: 'shares', bars: daily }));
    fallback.returnsInterval = 'day';
    const engine = new KlineReliabilityEngine({ providersFor: () => [fallback], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: 'all' });
    expect(result.completeness).toBe('partial');
    expect(result.warnings).toContain('partial_coverage');
    expect(result.availableBars).toBeLessThan(600);
  });

  it('marks native All monthly history complete regardless of depth', async () => {
    const monthly: SourceKlineBar[] = [
      { time: '2024-01-01', open: 10, high: 12, low: 9, close: 11, volume: 500 },
      { time: '2025-01-01', open: 11, high: 13, low: 10, close: 12, volume: 600 },
      { time: '2026-08-01', open: 12, high: 14, low: 11, close: 13, volume: 700 },
    ];
    const native = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'none', volumeUnit: 'shares', bars: monthly }));
    native.returnsInterval = 'month';
    const engine = new KlineReliabilityEngine({ providersFor: () => [native], now: () => NOW });

    const result = await engine.resolve({ ticker: 'NVDA', range: 'all' });
    expect(result.bars).toEqual(monthly);
    expect(result.completeness).toBe('complete');
    expect(result.partial).toBe(true);
  });

  it('returns last-known-good data as explicitly stale after providers fail', async () => {
    let fail = false;
    let now = new Date('2026-08-12T00:00:00Z');
    const fetch = vi.fn(async () => {
      if (fail) throw new KlineProviderError('transient', 'down');
      return { source: 'eastmoney' as const, adjustment: 'none' as const, volumeUnit: 'shares' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)], now: () => now });
    await engine.resolve({ ticker: 'NVDA', range: '1m' });
    fail = true;
    now = new Date('2026-08-12T00:01:00Z');

    const result = await engine.resolve({ ticker: 'NVDA', range: '1m' });
    expect(result).toMatchObject({ freshness: 'stale', cacheStatus: 'memory-lkg', staleAgeSeconds: 60 });
    expect(result.warnings).toContain('stale_cache');
  });

  it('single-flights concurrent requests for the same ticker and range', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetch = vi.fn(async () => {
      await gate;
      return { source: 'eastmoney' as const, adjustment: 'none' as const, volumeUnit: 'shares' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)], now: () => NOW });
    const first = engine.resolve({ ticker: 'NVDA', range: '1m' });
    const second = engine.resolve({ ticker: 'NVDA', range: '1m' });
    release();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caps retryable provider calls at the configured request budget', async () => {
    const fetch = vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down', true));
    const engine = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', fetch, 10)],
      now: () => NOW,
      maxCalls: 3,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(engine.resolve({ ticker: 'NVDA', range: '1m' })).rejects.toBeInstanceOf(KlineResolutionError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('limits concurrent calls per source', async () => {
    let active = 0;
    let maximum = 0;
    const fetch = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { source: 'eastmoney' as const, adjustment: 'none' as const, volumeUnit: 'shares' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', fetch)],
      now: () => NOW,
      sourceConcurrency: 2,
    });
    await Promise.all(['A', 'B', 'C', 'D'].map((ticker) => engine.resolve({ ticker, range: '1m' })));
    expect(maximum).toBe(2);
  });

  it('opens a circuit after five consecutive provider failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down'));
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)], now: () => NOW });
    for (let index = 0; index < 5; index += 1) {
      await expect(engine.resolve({ ticker: `NVDA${index}`, range: '1m' })).rejects.toBeInstanceOf(KlineResolutionError);
    }
    await expect(engine.resolve({ ticker: 'NVDA6', range: '1m' })).rejects.toBeInstanceOf(KlineResolutionError);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('opens a circuit when the rolling failure rate exceeds half without five consecutive failures', async () => {
    let call = 0;
    const failingCalls = new Set([1, 3, 5, 7, 9, 10]);
    const fetch = vi.fn(async () => {
      call += 1;
      if (failingCalls.has(call)) throw new KlineProviderError('transient', 'down');
      return { source: 'eastmoney' as const, adjustment: 'none' as const, volumeUnit: 'shares' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)], now: () => NOW });
    for (let index = 0; index < 10; index += 1) {
      await engine.resolve({ ticker: `ROLL${index}`, range: '1m' }).catch(() => undefined);
    }
    await engine.resolve({ ticker: 'ROLL10', range: '1m' }).catch(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('maps schema failures to 502 and outages to 503', async () => {
    const invalid = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', vi.fn().mockRejectedValue(new KlineProviderError('invalid_data', 'bad')))],
      now: () => NOW,
    });
    const outage = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down')))],
      now: () => NOW,
    });
    await expect(invalid.resolve({ ticker: 'NVDA', range: '1m' })).rejects.toMatchObject({ code: 'invalid_data', status: 502 });
    await expect(outage.resolve({ ticker: 'NVDA', range: '1m' })).rejects.toMatchObject({ code: 'provider_unavailable', status: 503 });
  });
});

describe('shared cache metadata', () => {
  const result: KlineResolution = {
    source: 'eastmoney',
    bars: completeBars(),
    adjustment: 'none',
    volumeUnit: 'shares',
    previousClose: null,
    availableBars: 40,
    warmupCloses: [],
    asOfFallback: '2026-08-12',
    freshness: 'fresh',
    fallbackUsed: false,
    cacheStatus: 'none',
    completeness: 'complete',
    partial: false,
    warnings: [],
    fetchedAt: '2026-08-12T00:00:00.000Z',
  };

  it('distinguishes a fresh calculation from a shared-cache hit', () => {
    expect(decorateCachedResolution(result, Date.parse(result.fetchedAt) - 1, 300_000).cacheStatus).toBe('none');
    expect(decorateCachedResolution(result, Date.parse(result.fetchedAt) + 1, 300_000).cacheStatus).toBe('shared-swr');
  });

  it('marks an over-TTL shared result stale instead of claiming it is live', () => {
    const decorated = decorateCachedResolution(result, Date.parse(result.fetchedAt) + 301_000, 300_000);
    expect(decorated).toMatchObject({ freshness: 'stale', cacheStatus: 'shared-swr', staleAgeSeconds: 301 });
    expect(decorated.warnings).toContain('stale_cache');
  });
});

describe('provider route matrix', () => {
  const originalBaseUrl = process.env.DATAGATEWAY_BASE_URL;
  const originalApiKey = process.env.DATAGATEWAY_API_KEY;
  const originalIntraday = process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED;

  beforeEach(() => {
    delete process.env.DATAGATEWAY_BASE_URL;
    delete process.env.DATAGATEWAY_API_KEY;
    delete process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED;
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.DATAGATEWAY_BASE_URL;
    else process.env.DATAGATEWAY_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.DATAGATEWAY_API_KEY;
    else process.env.DATAGATEWAY_API_KEY = originalApiKey;
    if (originalIntraday === undefined) delete process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED;
    else process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = originalIntraday;
  });

  it.each([
    ['600519.SH', '1d', undefined, ['eastmoney', 'sina']],
    ['600519.SH', '5d', undefined, ['eastmoney', 'sina']],
    ['600519.SH', '1m', undefined, ['eastmoney', 'tencent']],
    ['600519.SH', '5y', undefined, ['eastmoney', 'tencent']],
    ['600519.SH', '1y', 'hfq', ['eastmoney']],
    ['00700.HK', '1y', 'hfq', ['eastmoney']],
    ['NVDA', '1y', 'hfq', ['eastmoney', 'sina']],
    ['00700.HK', '1d', undefined, ['eastmoney']],
    ['00700.HK', '5d', undefined, ['eastmoney']],
    ['00700.HK', '1y', undefined, ['eastmoney', 'tencent']],
    ['NVDA', '1d', undefined, ['eastmoney']],
    ['NVDA', '6m', undefined, ['eastmoney', 'sina']],
    ['NVDA', '5y', undefined, ['eastmoney', 'sina']],
    ['NVDA', 'all', undefined, ['eastmoney', 'sina']],
    ['2330.TW', '1y', undefined, ['twse']],
    ['2330.TW', 'all', undefined, ['twse']],
    ['5483.TWO', '1m', undefined, ['tpex']],
    ['2330.TW', '1d', undefined, []],
    ['2330.TW', '5d', undefined, []],
    ['7203.T', '1d', undefined, []],
    ['7203.T', '5d', undefined, []],
    ['7203.T', '1m', undefined, []],
    ['005930.KS', '1y', undefined, []],
    ['005930.KS', '5y', undefined, []],
  ] as const)('routes %s %s only to verified historical providers', (ticker, range, adjustment, expected) => {
    expect(klineProviderRoute(ticker, range, adjustment)).toEqual(expected);
  });

  it('prefers complete OHLCV feeds and keeps Datagateway as a daily fallback', () => {
    const base = process.env.DATAGATEWAY_BASE_URL;
    const key = process.env.DATAGATEWAY_API_KEY;
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'test-key';
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    try {
      expect(klineProviderRoute('600519.SH', '1m')).toEqual(['eastmoney', 'tencent', 'datagateway']);
      expect(klineProviderRoute('7203.T', '1y')).toEqual(['datagateway']);
      expect(klineProviderRoute('005930.KS', '6m')).toEqual(['datagateway']);
      expect(klineProviderRoute('005930.KS', '5y')).toEqual(['datagateway']);
      expect(klineProviderRoute('2330.TW', '1y')).toEqual(['twse', 'datagateway']);
      expect(klineProviderRoute('7203.T', '1d')).toEqual([]);
      expect(klineProviderRoute('600519.SH', '1d')).toEqual(['datagateway', 'eastmoney', 'sina']);
      expect(klineProviderRoute('600519.SH', '5d')).toEqual(['datagateway', 'eastmoney', 'sina']);
    } finally {
      if (base === undefined) delete process.env.DATAGATEWAY_BASE_URL;
      else process.env.DATAGATEWAY_BASE_URL = base;
      if (key === undefined) delete process.env.DATAGATEWAY_API_KEY;
      else process.env.DATAGATEWAY_API_KEY = key;
    }
  });

  it('enables Wind intraday only when the capability flag is set', () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'test-key';
    expect(klineProviderRoute('600519.SH', '1d')).toEqual(['eastmoney', 'sina']);
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    expect(klineProviderRoute('600519.SH', '1d')).toEqual(['datagateway', 'eastmoney', 'sina']);
  });
});
