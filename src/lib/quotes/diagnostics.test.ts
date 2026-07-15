import { describe, expect, it } from 'vitest';
import { aggregateSourceAttempts, classifySourceFailure } from './diagnostics';

describe('quote diagnostics', () => {
  it('classifies aborts and timeout messages as timeout', () => {
    expect(classifySourceFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe('timeout');
    expect(classifySourceFailure(new Error('connect timeout'))).toBe('timeout');
  });

  it('classifies other failures as errors', () => {
    expect(classifySourceFailure(new Error('bad gateway'))).toBe('error');
  });

  it('aggregates attempts by source', () => {
    expect(aggregateSourceAttempts([
      { ticker: 'AAPL', source: 'eastmoney', outcome: 'empty', attempts: 2, duration_ms: 20 },
      { ticker: 'AAPL', source: 'sina', outcome: 'success', attempts: 1, duration_ms: 10 },
    ])).toEqual({
      eastmoney: { attempted: 1, succeeded: 0, failed: 1, retries: 1, duration_ms: 20 },
      sina: { attempted: 1, succeeded: 1, failed: 0, retries: 0, duration_ms: 10 },
    });
  });

  it('normalizes unsafe counters and durations', () => {
    expect(aggregateSourceAttempts([
      { ticker: 'AAPL', source: 'eastmoney', outcome: 'error', attempts: -2, duration_ms: Number.NaN },
    ])).toEqual({
      eastmoney: { attempted: 1, succeeded: 0, failed: 1, retries: 0, duration_ms: 0 },
    });
  });
});
