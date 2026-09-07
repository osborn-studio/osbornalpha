import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistOverviewQuery, loadWatchlistReviewQueue } from './server-repository';
import { parseWatchlistOverviewQuery } from './overview-query';

describe('loadWatchlistOverviewQuery', () => {
  it('passes the typed query to the RPC and validates its query cursor', async () => {
    const request = parseWatchlistOverviewQuery(new URL(
      'https://example.test?sort=change&direction=desc&market=US&quoteStatus=live&metric=rsi14&metricMin=30',
    ));
    const rpc = vi.fn(async () => ({
      data: {
        total: 2,
        has_more: true,
        next_cursor: {
          mode: 'query', fingerprint: request.fingerprint, nullRank: 0,
          sortNumber: 55, sortText: null, itemId: '11111111-1111-5111-8111-111111111111',
        },
        rows: [{
          group: { id: 'wl-1', name: 'Core', sort_order: 0 },
          item: {
            id: '11111111-1111-5111-8111-111111111111', ticker: 'AAPL', conviction: 8,
            sort_order: 0, decision_version: 1, tags: [], status: 'watching',
          },
          querySnapshot: {
            sortKey: 'change', sortNumber: 1.2, sortText: null,
            sortAsOf: '2026-09-04T12:00:00Z', metricKey: 'rsi14', metricNumber: 55,
            metricAsOf: '2026-09-04T11:00:00Z', currency: 'USD',
          },
        }],
      },
      error: null,
    }));
    const page = await loadWatchlistOverviewQuery({ rpc } as never, request);
    expect(rpc).toHaveBeenCalledWith('get_watchlist_overview_query', expect.objectContaining({
      p_sort: 'change', p_direction: 'desc', p_market: 'US', p_quote_status: 'live',
      p_metric: 'rsi14', p_metric_min: 30,
      p_fingerprint: request.fingerprint,
    }));
    expect(page).toMatchObject({
      total: 2,
      hasMore: true,
      nextCursor: { mode: 'query', fingerprint: request.fingerprint, sortNumber: 55 },
      rows: [{ querySnapshot: { sortKey: 'change', sortNumber: 1.2, metricNumber: 55 } }],
    });
  });

  it('rejects malformed database payloads instead of leaking them to the client', async () => {
    const request = parseWatchlistOverviewQuery(new URL('https://example.test?sort=rsi14'));
    await expect(loadWatchlistOverviewQuery({
      rpc: vi.fn(async () => ({ data: { total: -1, rows: [] }, error: null })),
    } as never, request)).rejects.toThrow('invalid_watchlist_overview_page');
  });
});

describe('loadWatchlistReviewQueue', () => {
  it('bounds arguments and validates the RPC response', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        generated_at: '2026-09-04T12:00:00Z', timezone: 'UTC', horizon_days: 30,
        summary: { overdue: 1, due_today: 0, upcoming: 0, unscheduled: 0 },
        rows: [{
          group: { id: 'group-1', name: 'Core', sort_order: 0 },
          item: { id: 'item-1', ticker: 'AAPL' }, identity: null, review_bucket: 'overdue', review_reasons: [],
        }],
      },
      error: null,
    }));
    const queue = await loadWatchlistReviewQueue({ rpc } as never, { scope: 'due', horizonDays: 90, limit: 500 });
    expect(rpc).toHaveBeenCalledWith('get_watchlist_review_queue', {
      p_scope: 'due', p_horizon_days: 30, p_limit: 100,
    });
    expect(queue.rows[0]).toMatchObject({ reviewBucket: 'overdue', item: { ticker: 'AAPL' } });
  });
});
