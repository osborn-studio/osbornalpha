import { describe, it, expect, vi } from 'vitest';
import { fetchScoringBars } from './daily-bars';
import type { KlineResolution } from '@/lib/data/kline/reliability';
import { KlineResolutionError } from '@/lib/data/kline/reliability';

const bar = (time: string, close = 10) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const resolution = (o: Partial<KlineResolution>): KlineResolution => ({
  bars: [bar('2026-11-19'), bar('2026-11-20')], source: 'tencent', adjustment: 'none', volumeUnit: 'shares',
  previousClose: null, availableBars: 2, warmupCloses: [], asOfFallback: '2026-11-20', freshness: 'fresh',
  fallbackUsed: true, cacheStatus: 'none', completeness: 'complete', partial: false, warnings: ['fallback_used'],
  fetchedAt: '2026-11-20T09:00:00Z', ...o,
});

describe('fetchScoringBars', () => {
  it('asks the reliability engine once per ticker for a one-year daily window', async () => {
    const resolve = vi.fn(async () => resolution({}));
    const out = await fetchScoringBars(['01810.HK', '01810.HK', 'NVDA'], resolve);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith({ ticker: '01810.HK', range: '1y' });
    expect(resolve).toHaveBeenCalledWith({ ticker: 'NVDA', range: '1y' });
    expect(out.get('01810.HK')).toEqual([bar('2026-11-19'), bar('2026-11-20')]);
  });

  it('keeps going when one ticker has no provider', async () => {
    const resolve = vi.fn(async ({ ticker }: { ticker: string }) => {
      if (ticker === 'BAD') throw new KlineResolutionError('provider_unavailable', 503, 'All K-line providers are unavailable');
      return resolution({});
    });
    const out = await fetchScoringBars(['BAD', '600519.SH'], resolve);
    expect(out.get('BAD')).toBeNull();
    expect(out.get('600519.SH')).toHaveLength(2);
  });

  it('treats a stale last-known-good series and an empty series as unavailable', async () => {
    const resolve = vi.fn(async ({ ticker }: { ticker: string }) =>
      ticker === 'STALE' ? resolution({ freshness: 'stale' }) : resolution({ bars: [] }));
    const out = await fetchScoringBars(['STALE', 'EMPTY'], resolve);
    expect(out.get('STALE')).toBeNull();
    expect(out.get('EMPTY')).toBeNull();
  });

  it.each([
    ['600519.SH', '2026-11-20T04:00:00Z', false], // Shanghai lunch
    ['00700.HK', '2026-11-20T05:30:00Z', false], // Hong Kong afternoon session
    ['NVDA', '2026-11-20T14:00:00Z', false], // New York pre-market
    ['NVDA', '2026-11-21T00:30:00Z', true], // still Friday in New York, after close
    ['00700.HK', '2026-11-20T08:08:00Z', false], // closing auction may still be in progress
    ['00700.HK', '2026-11-20T08:10:00Z', true], // Hong Kong after close
  ] as const)('only scores completed exchange dates for %s as of %s', async (ticker, fetchedAt, final) => {
    const rows = [bar('2026-11-19'), bar('2026-11-20'), bar('2026-11-23')];
    const resolve = async () => resolution({ bars: rows, fetchedAt });
    const result = await fetchScoringBars([ticker], resolve);
    expect(result.get(ticker)).toEqual(rows.slice(0, final ? 2 : 1));
  });

  it('returns an empty map for no tickers', async () => {
    const resolve = vi.fn();
    expect((await fetchScoringBars([], resolve)).size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });
});
