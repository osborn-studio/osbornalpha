import { describe, expect, it, vi } from 'vitest';
import type { QuoteShape } from '@/lib/quotes/resolve-quote';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import type { AlertWithItem } from './alert-run-repository';
import { runWatchlistAlertBatch, runWatchlistAlertCycles } from './alert-runner';

function alert(overrides: Partial<WatchlistAlert> = {}): AlertWithItem {
  return {
    id: 'alert-1', user_id: 'user-1', watchlist_item_id: 'item-1', alert_type: 'rating',
    operator: null, threshold_numeric: null, config: {}, enabled: true, cooldown_minutes: 1440,
    last_observed_value: null, last_observed_key: 'report-1', last_evaluated_at: '2026-09-03T00:00:00Z',
    last_triggered_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    watchlist_items: { id: 'item-1', ticker: 'AAPL' },
    ...overrides,
  };
}

function quote(): QuoteShape {
  return {
    source: 'test', ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$',
    price: 200, change: 2, change_pct: 1, open: 198, high: 201, low: 197,
    prev_close: 198, volume: 100, amount: 20_000, amplitude: 2,
    market_cap: null, market_cap_label: '--', pe_ttm: 25, pb: 4,
    turnover: null, volume_ratio: 1.2, updated_at: '2026-09-04T12:00:00Z', delayed: false,
  };
}

describe('runWatchlistAlertBatch', () => {
  it('deduplicates market loads and persists every unseen research event', async () => {
    const alerts = [alert(), alert({ id: 'alert-2', alert_type: 'price', operator: 'gte', threshold_numeric: 190 })];
    const loadQuote = vi.fn(async () => quote());
    const loadCalendar = vi.fn(async () => null);
    const insertEvent = vi.fn(async (event: { event_key?: string }) => (
      event.event_key === 'rating:report-1' ? 'duplicate' as const : 'inserted' as const
    ));
    const updateAlert = vi.fn(async () => undefined);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts, saturated: true }),
      loadQuote,
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar,
      loadResearch: async () => [{
        ownerId: 'user-1', ticker: 'AAPL', perspectives: [], reports: [
          { id: 'report-3', ticker: 'AAPL', broker: 'A', rating: 'sell' },
          { id: 'report-2', ticker: 'AAPL', broker: 'B', rating: 'hold' },
          { id: 'report-1', ticker: 'AAPL', broker: 'C', rating: 'buy' },
        ] as never,
      }],
      insertEvent,
      updateAlert,
      deliver: async () => ({ claimed: 3, delivered: 3, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-04T12:01:00Z'),
    });

    expect(loadQuote).toHaveBeenCalledTimes(1);
    expect(loadCalendar).not.toHaveBeenCalled();
    expect(insertEvent).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      evaluated: 2, triggered: 3, unavailable: 0, skippedClosed: 0, saturated: true,
      delivery: { claimed: 3, delivered: 3, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 },
    });
    expect(updateAlert).toHaveBeenCalledWith('alert-1', expect.objectContaining({
      last_observed_key: 'report-3', last_evaluated_at: '2026-09-04T12:01:00.000Z',
    }));
  });

  it('persists first-run research candidates as skipped baselines', async () => {
    const insertEvent = vi.fn(async () => 'inserted' as const);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert({ last_evaluated_at: null, last_observed_key: null })], saturated: false }),
      loadQuote: async () => quote(),
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar: async () => null,
      loadResearch: async () => [{
        ownerId: 'user-1', ticker: 'AAPL', perspectives: [], reports: [
          { id: 'report-1', ticker: 'AAPL', broker: 'A', rating: 'hold' },
        ] as never,
      }],
      insertEvent,
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
    });

    expect(result.triggered).toBe(0);
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_key: 'rating:report-1',
      delivery_status: 'skipped',
      last_delivery_error: 'already_seen',
    }));
  });

  it('does not load quotes or calendars for rating and perspective alerts', async () => {
    const loadQuote = vi.fn(async () => quote());
    const loadCalendar = vi.fn(async () => null);
    const loadResearch = vi.fn(async () => [{
      ownerId: 'user-1', ticker: 'AAPL', reports: [], perspectives: [],
    }]);
    await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert()], saturated: false }),
      loadQuote,
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar,
      loadResearch,
      insertEvent: async () => 'inserted',
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
    });
    expect(loadQuote).not.toHaveBeenCalled();
    expect(loadCalendar).not.toHaveBeenCalled();
    expect(loadResearch).toHaveBeenCalledTimes(1);
  });

  it('loads shared metric snapshots without fetching quotes or research', async () => {
    const loadQuote = vi.fn(async () => quote());
    const loadMetrics = vi.fn(async () => ({
      AAPL: {
        rsi14: 28,
        observed_at: '2026-09-04T12:00:00Z',
        generated_at: '2026-09-04T12:00:00Z',
        valid_until: '2026-09-05T12:00:00Z',
      } as never,
    }));
    const loadResearch = vi.fn(async () => []);
    const insertEvent = vi.fn(async () => 'inserted' as const);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert({
        alert_type: 'metric', operator: 'lte', threshold_numeric: 30, config: { metric: 'rsi14' },
      })], saturated: false }),
      loadQuote,
      loadMetrics,
      loadPeerMetrics: async () => ({}),
      loadCalendar: async () => null,
      loadResearch,
      insertEvent,
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-04T12:01:00Z'),
    });
    expect(loadMetrics).toHaveBeenCalledWith(['AAPL']);
    expect(loadQuote).not.toHaveBeenCalled();
    expect(loadResearch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ evaluated: 1, triggered: 1, unavailable: 0 });
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      alert_type: 'metric', observed_value: 28,
    }));
  });

  it('loads peer metrics once per user without loading snapshot metrics', async () => {
    const loadMetrics = vi.fn(async () => ({}));
    const loadPeerMetrics = vi.fn(async () => ({
      AAPL: {
        value: {
          marketRelativeStrengthPercentile: 84,
          marketLiquidityPercentile: 72,
        },
        asOf: '2026-09-04T12:00:00Z',
        source: 'shared-peer-snapshots',
        status: 'fresh',
        warnings: [],
      } as never,
    }));
    const insertEvent = vi.fn(async () => 'inserted' as const);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({
        alerts: [
          alert({
            id: 'alert-strength', alert_type: 'metric', operator: 'gte', threshold_numeric: 80,
            config: { metric: 'market_relative_strength_percentile' },
          }),
          alert({
            id: 'alert-liquidity', alert_type: 'metric', operator: 'gte', threshold_numeric: 70,
            config: { metric: 'market_liquidity_percentile' },
          }),
        ],
        saturated: false,
      }),
      loadQuote: async () => quote(),
      loadMetrics,
      loadPeerMetrics,
      loadCalendar: async () => null,
      loadResearch: async () => [],
      insertEvent,
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-04T12:01:00Z'),
    });

    expect(loadMetrics).not.toHaveBeenCalled();
    expect(loadPeerMetrics).toHaveBeenCalledTimes(1);
    expect(loadPeerMetrics).toHaveBeenCalledWith('user-1', ['AAPL']);
    expect(result).toMatchObject({ evaluated: 2, triggered: 2, unavailable: 0 });
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({ observed_value: 84 }));
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({ observed_value: 72 }));
  });

  it('loads only the calendar for event alerts', async () => {
    const loadQuote = vi.fn(async () => quote());
    const loadCalendar = vi.fn(async () => ({
      ticker: 'AAPL', as_of: '2026-09-04T12:00:00Z', horizon_days: 14,
      events: [], next_earnings: null,
    }));
    const loadResearch = vi.fn(async () => []);
    await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert({ alert_type: 'event' })], saturated: false }),
      loadQuote,
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar,
      loadResearch,
      insertEvent: async () => 'inserted',
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
    });
    expect(loadQuote).not.toHaveBeenCalled();
    expect(loadCalendar).toHaveBeenCalledTimes(1);
    expect(loadResearch).not.toHaveBeenCalled();
  });

  it('rotates unavailable rules by recording their evaluation time', async () => {
    const updateAlert = vi.fn(async () => undefined);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert({ alert_type: 'price', operator: 'gte', threshold_numeric: 190 })], saturated: false }),
      loadQuote: async () => null,
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar: async () => null,
      loadResearch: async () => [],
      insertEvent: async () => 'inserted',
      updateAlert,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-04T12:01:00Z'),
    });
    expect(result.unavailable).toBe(1);
    expect(updateAlert).toHaveBeenCalledWith('alert-1', expect.objectContaining({
      last_evaluated_at: '2026-09-04T12:01:00.000Z', updated_at: '2026-09-04T12:01:00.000Z',
    }));
  });

  it('rotates closed-market rules without loading market data', async () => {
    const loadQuote = vi.fn(async () => quote());
    const updateAlert = vi.fn(async () => undefined);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert({ alert_type: 'price' })], saturated: false }),
      loadQuote,
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar: async () => null,
      loadResearch: async () => [],
      insertEvent: async () => 'inserted',
      updateAlert,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-05T12:00:00.000Z'),
      shouldEvaluate: () => false,
    });
    expect(result).toMatchObject({ evaluated: 0, skippedClosed: 1, unavailable: 0 });
    expect(loadQuote).not.toHaveBeenCalled();
    expect(updateAlert).toHaveBeenCalledWith('alert-1', {
      last_evaluated_at: '2026-09-05T12:00:00.000Z', updated_at: '2026-09-05T12:00:00.000Z',
    });
  });
});

describe('runWatchlistAlertCycles', () => {
  it('continues saturated batches and aggregates their delivery totals', async () => {
    const loadBatch = vi.fn()
      .mockResolvedValueOnce({ alerts: [], saturated: true })
      .mockResolvedValueOnce({ alerts: [], saturated: false });
    const result = await runWatchlistAlertCycles({
      loadBatch,
      loadQuote: async () => quote(),
      loadMetrics: async () => ({}),
      loadPeerMetrics: async () => ({}),
      loadCalendar: async () => null,
      loadResearch: async () => [],
      insertEvent: async () => 'inserted',
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 1, delivered: 1, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
    });
    expect(loadBatch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ saturated: false, delivery: { claimed: 2, delivered: 2 } });
  });
});
