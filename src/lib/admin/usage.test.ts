import { describe, expect, it } from 'vitest';
import { aggregateUsage } from './usage';

const event = (
  event_name: string,
  user_id: string | null,
  metadata: Record<string, unknown> = {},
  anonymous_id = user_id ? null : 'anon-1'
) => ({
  event_name,
  user_id,
  anonymous_id,
  metadata,
  created_at: '2026-07-15T00:00:00Z',
});

const run = (
  status: 'running' | 'completed' | 'failed',
  user_id: string,
  ticker: string,
  duration_ms: number | null,
  error_code: string | null = null
) => ({
  status,
  user_id,
  ticker,
  duration_ms,
  method_id: 'john-cameron-5step',
  error_code,
  created_at: '2026-07-15T00:00:00Z',
});

describe('aggregateUsage', () => {
  it('computes activation and AI conversion using unique users', () => {
    const result = aggregateUsage({
      confirmedUsers: [{ id: 'u1' }, { id: 'u2' }],
      events: [
        event('watchlist_viewed', 'u1'),
        event('watchlist_viewed', 'u1'),
        event('watchlist_stock_added', 'u1', { ticker: 'AAPL' }),
        event('post_add_insight_viewed', 'u1'),
        event('post_add_ai_clicked', 'u1'),
      ],
      aiRuns: [run('completed', 'u1', 'AAPL', 1200)],
    });
    expect(result.funnel).toMatchObject({
      registrations: 2,
      watchlist_viewers: 1,
      activated_users: 1,
      activation_rate: 0.5,
    });
    expect(result.ai.completion_rate).toBe(1);
    expect(result.ai.post_add_click_rate).toBe(1);
  });

  it('excludes unknown event names from funnel metrics', () => {
    const result = aggregateUsage({
      confirmedUsers: [],
      events: [event('wp_scan', null)],
      aiRuns: [],
    });
    expect(result.funnel.watchlist_viewers).toBe(0);
    expect(result.funnel.activated_users).toBe(0);
  });

  it('uses anonymous identities and aggregates quote source health', () => {
    const result = aggregateUsage({
      confirmedUsers: [],
      events: [
        event('watchlist_viewed', null, {}, 'anon-1'),
        event('watchlist_stock_added', null, { ticker: '510300.SH' }, 'anon-1'),
        event('quote_batch_loaded', null, {
          failed: 2,
          stale: 1,
          sources: {
            eastmoney: { attempted: 3, succeeded: 1, failed: 2, retries: 2, duration_ms: 50 },
            sina: { attempted: 2, succeeded: 2, failed: 0, retries: 0, duration_ms: 20 },
          },
        }),
        event('quote_batch_degraded', null, {
          failed: 1,
          stale: 1,
          failed_tickers: ['600000.SH'],
        }),
      ],
      aiRuns: [],
    });
    expect(result.funnel).toMatchObject({ watchlist_viewers: 1, activated_users: 1 });
    expect(result.quotes).toEqual({
      batches: 2,
      failed_tickers: 3,
      stale: 2,
      sources: {
        eastmoney: { attempted: 3, succeeded: 1, failed: 2, duration_ms: 50 },
        sina: { attempted: 2, succeeded: 2, failed: 0, duration_ms: 20 },
      },
    });
  });

  it('calculates median duration and returns only operational failure fields', () => {
    const result = aggregateUsage({
      confirmedUsers: [{ id: 'u1' }],
      events: [],
      aiRuns: [
        run('completed', 'u1', 'AAPL', 100),
        run('failed', 'u1', 'MSFT', 300, 'provider_error'),
        run('completed', 'u1', 'NVDA', 200),
      ],
    });
    expect(result.ai.median_duration_ms).toBe(200);
    expect(result.recent_ai_failures).toEqual([{
      ticker: 'MSFT',
      method_id: 'john-cameron-5step',
      error_code: 'provider_error',
      created_at: '2026-07-15T00:00:00Z',
    }]);
    expect(result.recent_ai_failures[0]).not.toHaveProperty('user_id');
  });
});
