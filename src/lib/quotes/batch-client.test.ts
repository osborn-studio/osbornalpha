import { describe, expect, it } from 'vitest';
import {
  chunkQuoteTickers,
  mergeQuoteBatchResults,
  shouldReportQuoteBatch,
} from './batch-client';

describe('quote batch client resilience', () => {
  it('splits a 50-stock watchlist into bounded requests without dropping tickers', () => {
    const tickers = Array.from({ length: 50 }, (_, index) => `T${index}`);
    const chunks = chunkQuoteTickers(tickers, 20);

    expect(chunks.map((chunk) => chunk.length)).toEqual([20, 20, 10]);
    expect(chunks.flat()).toEqual(tickers);
  });

  it('merges successful chunks and preserves cached quotes for a failed chunk', () => {
    const cached: Record<string, { ticker: string; price?: number }> = {
      A: { ticker: 'A' },
      B: { ticker: 'B' },
    };
    const result = mergeQuoteBatchResults({
      tickers: ['A', 'B', 'C'],
      previousQuotes: cached,
      settled: [
        { status: 'fulfilled', value: { quotes: { A: { ticker: 'A', price: 10 }, C: { ticker: 'C', price: 30 } }, meta: { failed: 0 } } },
        { status: 'rejected', reason: new Error('network') },
      ],
      chunks: [['A', 'C'], ['B']],
    });

    expect(result.quotes).toEqual({
      A: { ticker: 'A', price: 10 },
      B: { ticker: 'B' },
      C: { ticker: 'C', price: 30 },
    });
    expect(result.meta.failed_tickers).toEqual(['B']);
    expect(result.meta.failed_chunks).toBe(1);
    expect(result.meta.stale).toBe(1);
  });

  it('suppresses routine polling telemetry inside the ten-minute window', () => {
    expect(shouldReportQuoteBatch({ now: 100_000, lastReportedAt: 90_000, manual: false, failed: 0, stale: 0, durationMs: 200 })).toBe(false);
    expect(shouldReportQuoteBatch({ now: 700_000, lastReportedAt: 90_000, manual: false, failed: 0, stale: 0, durationMs: 200 })).toBe(true);
    expect(shouldReportQuoteBatch({ now: 100_000, lastReportedAt: 90_000, manual: false, failed: 1, stale: 0, durationMs: 200 })).toBe(true);
  });
});
