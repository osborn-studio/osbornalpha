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

  it('counts auth funnel people once instead of counting repeated submissions', () => {
    const result = aggregateUsage({
      confirmedUsers: [{ id: 'u1' }, { id: 'u2' }],
      events: [
        event('signup_email_sent', null, {}, 'anon-1'),
        event('signup_email_sent', null, {}, 'anon-1'),
        event('signup_email_sent', null, {}, 'anon-2'),
        event('confirmation_resend_sent', null, {}, 'anon-1'),
        event('confirmation_resend_sent', null, {}, 'anon-1'),
        event('email_confirmation_succeeded', 'u1', {}, 'anon-1'),
        event('email_confirmation_succeeded', 'u1', {}, 'anon-1'),
        event('first_login_succeeded', 'u1'),
        event('first_login_succeeded', 'u1'),
      ],
      aiRuns: [],
    });

    expect(result.auth_funnel).toEqual({
      signup_email_sent: 2,
      confirmation_resenders: 1,
      confirmed_users: 1,
      first_login_users: 1,
      email_to_confirmation_rate: 0.5,
      confirmation_to_first_login_rate: 1,
    });
  });

  it('does not count OAuth callbacks as email confirmations', () => {
    const result = aggregateUsage({
      confirmedUsers: [{ id: 'u1' }],
      events: [
        event('signup_email_sent', null, {}, 'anon-1'),
        event('auth_callback_succeeded', 'u1'),
        event('first_login_succeeded', 'u1'),
      ],
      aiRuns: [],
    });

    expect(result.auth_funnel).toMatchObject({
      signup_email_sent: 1,
      confirmed_users: 0,
      email_to_confirmation_rate: 0,
    });
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

  it('returns recent service checks and probe status without recipient hashes', () => {
    const result = aggregateUsage({
      confirmedUsers: [],
      events: [],
      aiRuns: [],
      serviceAlertRuns: [{
        check_name: 'quote_15m',
        status: 'alerting',
        window_start: '2026-07-21T01:45:00Z',
        window_end: '2026-07-21T02:00:00Z',
        violations: [{ code: 'quote_batch_degraded' }],
        created_at: '2026-07-21T02:00:01Z',
      }],
      authEmailProbes: [{
        recipient_hash: 'secret-hash',
        domain: 'qq.com',
        probe_date: '2026-07-21',
        signup_delivery: 'delivered',
        recovery_delivery: 'pending',
      }],
    });
    expect(result.operational.latest_checks[0]).toMatchObject({
      check_name: 'quote_15m',
      status: 'alerting',
      violation_codes: ['quote_batch_degraded'],
    });
    expect(result.operational.auth_email_probes[0]).toEqual({
      domain: 'qq.com',
      probe_date: '2026-07-21',
      signup_delivery: 'delivered',
      recovery_delivery: 'pending',
    });
    expect(result.operational.auth_email_probes[0]).not.toHaveProperty('recipient_hash');
  });
});
