import { describe, expect, it, vi } from 'vitest';
import type { RadarPayload } from '@/lib/brief/radar';
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

function radar(): RadarPayload {
  return {
    ticker: 'AAPL', market: 'US',
    as_of: '2026-09-04T12:00:00Z',
    sections: {
      price: { value: 200, change_pct: 1, volume_ratio: 1.2, pe_ttm: 25, pb: 4 },
      calendar: { upcoming: [] },
    },
  } as unknown as RadarPayload;
}

describe('runWatchlistAlertBatch', () => {
  it('deduplicates market loads and persists every unseen research event', async () => {
    const alerts = [alert(), alert({ id: 'alert-2', alert_type: 'price', operator: 'gte', threshold_numeric: 190 })];
    const loadRadar = vi.fn(async () => radar());
    const insertEvent = vi.fn(async (event: { event_key?: string }) => (
      event.event_key === 'rating:report-1' ? 'duplicate' as const : 'inserted' as const
    ));
    const updateAlert = vi.fn(async () => undefined);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts, saturated: true }),
      loadRadar,
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

    expect(loadRadar).toHaveBeenCalledTimes(1);
    expect(insertEvent).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      evaluated: 2, triggered: 3, unavailable: 0, saturated: true,
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
      loadRadar: async () => radar(),
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

  it('rotates unavailable rules by recording their evaluation time', async () => {
    const updateAlert = vi.fn(async () => undefined);
    const result = await runWatchlistAlertBatch({
      loadBatch: async () => ({ alerts: [alert()], saturated: false }),
      loadRadar: async () => { throw new Error('provider offline'); },
      loadResearch: async () => [],
      insertEvent: async () => 'inserted',
      updateAlert,
      deliver: async () => ({ claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
      now: () => new Date('2026-09-04T12:01:00Z'),
    });
    expect(result.unavailable).toBe(1);
    expect(updateAlert).toHaveBeenCalledWith('alert-1', {
      last_evaluated_at: '2026-09-04T12:01:00.000Z', updated_at: '2026-09-04T12:01:00.000Z',
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
      loadRadar: async () => radar(),
      loadResearch: async () => [],
      insertEvent: async () => 'inserted',
      updateAlert: async () => undefined,
      deliver: async () => ({ claimed: 1, delivered: 1, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 }),
    });
    expect(loadBatch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ saturated: false, delivery: { claimed: 2, delivered: 2 } });
  });
});
