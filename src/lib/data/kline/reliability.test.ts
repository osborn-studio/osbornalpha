import { describe, expect, it, vi } from 'vitest';
import {
  decorateCachedResolution,
  klineProviderRoute,
  KlineReliabilityEngine,
  KlineResolutionError,
  type KlineResolution,
} from './reliability';
import { KlineProviderError, type KlineProvider, type SourceKlineBar } from './types';

const completeBars = (count = 22): SourceKlineBar[] => Array.from({ length: count }, (_, index) => ({
  time: `2026-07-${String(index + 1).padStart(2, '0')}`,
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
      .mockResolvedValue({ source: 'eastmoney', adjustment: 'none', bars: completeBars() });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const engine = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', fetch, 2)],
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
    const secondary = provider('sina', vi.fn().mockResolvedValue({ source: 'sina', adjustment: 'none', bars: completeBars() }));
    const engine = new KlineReliabilityEngine({ providersFor: () => [primary, secondary] });

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
    const intraday = provider('eastmoney', vi.fn().mockResolvedValue({ source: 'eastmoney', adjustment: 'intraday', bars }));
    intraday.adjustment = 'intraday';
    const engine = new KlineReliabilityEngine({ providersFor: () => [intraday] });
    const result = await engine.resolve({ ticker: 'NVDA', range: '1d' });
    expect(result.bars.map((bar) => bar.time)).toEqual(['2026-08-11 09:30:00', '2026-08-11 09:31:00']);
    expect(result.completeness).toBe('partial');
  });

  it('returns last-known-good data as explicitly stale after providers fail', async () => {
    let fail = false;
    let now = new Date('2026-08-12T00:00:00Z');
    const fetch = vi.fn(async () => {
      if (fail) throw new KlineProviderError('transient', 'down');
      return { source: 'eastmoney' as const, adjustment: 'none' as const, bars: completeBars() };
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
      return { source: 'eastmoney' as const, adjustment: 'none' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)] });
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
      return { source: 'eastmoney' as const, adjustment: 'none' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', fetch)],
      sourceConcurrency: 2,
    });
    await Promise.all(['A', 'B', 'C', 'D'].map((ticker) => engine.resolve({ ticker, range: '1m' })));
    expect(maximum).toBe(2);
  });

  it('opens a circuit after five consecutive provider failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down'));
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)] });
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
      return { source: 'eastmoney' as const, adjustment: 'none' as const, bars: completeBars() };
    });
    const engine = new KlineReliabilityEngine({ providersFor: () => [provider('eastmoney', fetch)] });
    for (let index = 0; index < 10; index += 1) {
      await engine.resolve({ ticker: `ROLL${index}`, range: '1m' }).catch(() => undefined);
    }
    await engine.resolve({ ticker: 'ROLL10', range: '1m' }).catch(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('maps schema failures to 502 and outages to 503', async () => {
    const invalid = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', vi.fn().mockRejectedValue(new KlineProviderError('invalid_data', 'bad')))],
    });
    const outage = new KlineReliabilityEngine({
      providersFor: () => [provider('eastmoney', vi.fn().mockRejectedValue(new KlineProviderError('transient', 'down')))],
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
  it.each([
    ['600519.SH', '1m', ['eastmoney', 'tencent']],
    ['00700.HK', '1y', ['eastmoney', 'tencent']],
    ['NVDA', '3m', ['eastmoney', 'sina']],
    ['2330.TW', '1y', ['twse']],
    ['5483.TWO', '1m', ['tpex']],
    ['NVDA', '1d', ['eastmoney']],
    ['2330.TW', '1d', []],
    ['7203.T', '1m', []],
  ] as const)('routes %s %s only to verified historical providers', (ticker, range, expected) => {
    expect(klineProviderRoute(ticker, range)).toEqual(expected);
  });
});
