import { describe, expect, it } from 'vitest';
import {
  classifyQuoteBatchOutcome,
  chunkQuoteTickers,
  mergeQuoteBatchResults,
  quoteBatchErrorCode,
  shouldRetryQuoteBatchError,
  shouldReportQuoteBatch,
} from './batch-client';

describe('quote batch client resilience', () => {
  it('splits a 50-stock watchlist into bounded requests without dropping tickers', () => {
    const tickers = Array.from({ length: 50 }, (_, index) => `T${index}`);
    const chunks = chunkQuoteTickers(tickers);

    expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 10, 10, 10]);
    expect(chunks.flat()).toEqual(tickers);
  });

  it('merges successful chunks and preserves cached quotes for a failed chunk', () => {
    const cached: Record<string, { ticker: string; price?: number; stale?: boolean; delayed?: boolean }> = {
      A: { ticker: 'A' },
      B: { ticker: 'B', stale: true, delayed: true },
    };
    const result = mergeQuoteBatchResults({
      tickers: ['A', 'B', 'C'],
      previousQuotes: cached,
      settled: [
        { status: 'fulfilled', value: { quotes: { A: { ticker: 'A', price: 10 }, C: { ticker: 'C', price: 30 } }, meta: { failed: 0 } } },
        { status: 'rejected', reason: new TypeError('Failed to fetch') },
      ],
      chunks: [['A', 'C'], ['B']],
    });

    expect(result.quotes).toEqual({
      A: { ticker: 'A', price: 10 },
      B: { ticker: 'B', stale: true, delayed: true },
      C: { ticker: 'C', price: 30 },
    });
    expect(result.meta.failed_tickers).toEqual(['B']);
    expect(result.meta.failed_chunks).toBe(1);
    expect(result.meta.error_codes).toEqual(['network_error']);
    expect(result.meta.stale).toBe(1);
  });

  it('retries transient failures but not ordinary client errors', () => {
    expect(shouldRetryQuoteBatchError(new TypeError('Failed to fetch'), 0)).toBe(true);
    expect(shouldRetryQuoteBatchError(new Error('quote batch HTTP 503'), 0)).toBe(true);
    expect(shouldRetryQuoteBatchError(new Error('quote batch HTTP 429'), 0)).toBe(true);
    expect(shouldRetryQuoteBatchError(new Error('quote batch HTTP 400'), 0)).toBe(false);
    expect(shouldRetryQuoteBatchError(new Error('quote batch HTTP 503'), 1)).toBe(false);
  });

  it('uses stable error codes without exposing raw exception messages', () => {
    expect(quoteBatchErrorCode(new TypeError('Failed to fetch https://secret.example'))).toBe('network_error');
    expect(quoteBatchErrorCode(new Error('quote batch HTTP 503'))).toBe('http_503');
    expect(quoteBatchErrorCode(new DOMException('aborted', 'AbortError'))).toBe('timeout');
  });

  it('separates laptop suspension from a real full quote failure', () => {
    expect(classifyQuoteBatchOutcome({
      allChunksFailed: true,
      allTickersUnavailable: true,
      failed: 1,
      durationMs: 5_330_247,
    })).toBe('suspended');
    expect(classifyQuoteBatchOutcome({
      allChunksFailed: true,
      allTickersUnavailable: true,
      failed: 1,
      durationMs: 22_691,
    })).toBe('failed');
    expect(classifyQuoteBatchOutcome({
      allChunksFailed: false,
      allTickersUnavailable: false,
      failed: 1,
      durationMs: 1_500,
    })).toBe('degraded');
  });

  it('suppresses routine polling telemetry inside the ten-minute window', () => {
    expect(shouldReportQuoteBatch({ now: 100_000, lastReportedAt: 90_000, manual: false, failed: 0, stale: 0, durationMs: 200 })).toBe(false);
    expect(shouldReportQuoteBatch({ now: 700_000, lastReportedAt: 90_000, manual: false, failed: 0, stale: 0, durationMs: 200 })).toBe(true);
    expect(shouldReportQuoteBatch({ now: 100_000, lastReportedAt: 90_000, manual: false, failed: 1, stale: 0, durationMs: 200 })).toBe(true);
  });
});
