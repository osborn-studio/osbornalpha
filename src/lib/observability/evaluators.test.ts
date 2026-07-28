import { describe, expect, it } from 'vitest';
import {
  evaluateAiDaily,
  evaluateQuoteWindow,
  previousBeijingDayWindow,
  previousQuarterHourWindow,
} from './evaluators';

describe('operational alert evaluators', () => {
  it('uses the previous complete Beijing calendar day for AI checks', () => {
    expect(previousBeijingDayWindow(new Date('2026-07-21T02:00:00.000Z'))).toEqual({
      from: '2026-07-19T16:00:00.000Z',
      to: '2026-07-20T16:00:00.000Z',
    });
  });

  it('alerts on AI failure rate, p95, and stale running tasks with error-code counts', () => {
    const result = evaluateAiDaily([
      ...Array.from({ length: 8 }, (_, index) => ({
        status: 'completed' as const,
        duration_ms: index === 7 ? 100_000 : 30_000,
        error_code: null,
        created_at: '2026-07-20T10:00:00.000Z',
      })),
      { status: 'failed', duration_ms: 95_000, error_code: 'provider_timeout', created_at: '2026-07-20T11:00:00.000Z' },
      { status: 'failed', duration_ms: 40_000, error_code: 'provider_timeout', created_at: '2026-07-20T12:00:00.000Z' },
      { status: 'running', duration_ms: null, error_code: null, created_at: '2026-07-20T15:40:00.000Z' },
    ], new Date('2026-07-20T16:00:00.000Z'));

    expect(result.metrics).toMatchObject({
      terminal_runs: 10,
      failed_runs: 2,
      failure_rate: 0.2,
      p95_duration_ms: 100_000,
      stale_running: 1,
      failures_by_error_code: { provider_timeout: 2 },
    });
    expect(result.violations.map((violation) => violation.code)).toEqual([
      'ai_failure_rate_high',
      'ai_p95_high',
      'ai_stale_running',
    ]);
  });

  it('does not alert when AI metrics are exactly on their thresholds', () => {
    const runs = Array.from({ length: 10 }, (_, index) => ({
      status: index === 0 ? 'failed' as const : 'completed' as const,
      duration_ms: index === 9 ? 90_000 : 10_000,
      error_code: index === 0 ? 'provider_error' : null,
      created_at: '2026-07-20T12:00:00.000Z',
    }));
    expect(evaluateAiDaily(runs, new Date('2026-07-20T16:00:00.000Z')).violations).toEqual([]);
  });

  it('uses the previous complete quarter hour and alerts on quote degradation and cache ratio', () => {
    expect(previousQuarterHourWindow(new Date('2026-07-21T02:17:31.000Z'))).toEqual({
      from: '2026-07-21T02:00:00.000Z',
      to: '2026-07-21T02:15:00.000Z',
    });

    const result = evaluateQuoteWindow([
      { event_name: 'quote_batch_loaded', metadata: { count: 20, stale: 0 } },
      { event_name: 'quote_batch_degraded', metadata: { count: 10, failed: 1, stale: 3 } },
      { event_name: 'quote_batch_failed', metadata: { count: 5, stale: 5 } },
    ]);

    expect(result.metrics).toEqual({
      batches: 3,
      full_failures: 1,
      degraded_batches: 1,
      attempted_tickers: 35,
      stale_tickers: 8,
      cache_ratio: 0.2286,
    });
    expect(result.violations.map((violation) => violation.code)).toEqual([
      'quote_batch_failed',
      'quote_batch_degraded',
      'quote_cache_ratio_high',
    ]);
  });
});
