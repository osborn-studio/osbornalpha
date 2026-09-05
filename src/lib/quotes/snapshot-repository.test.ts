import { describe, expect, it, vi } from 'vitest';
import { loadSharedQuoteSnapshots, persistSharedQuoteSnapshots } from './snapshot-repository';
import type { QuoteShape } from './resolve-quote';

function quote(ticker = 'AAPL'): QuoteShape {
  return {
    source: 'test', ticker, name: ticker, market: 'US', currency: '$', price: 200,
    change: 2, change_pct: 1, open: 198, high: 202, low: 197, prev_close: 198,
    volume: 100, amount: 20_000, amplitude: 2.5, market_cap: null,
    market_cap_label: '--', pe_ttm: 25, pb: 4, turnover: null,
    volume_ratio: 1.2, updated_at: '2026-09-04T12:00:00.000Z', delayed: false,
  };
}

describe('shared quote snapshot repository', () => {
  it('separates fresh and stale snapshots and rejects malformed quote payloads', async () => {
    const rows = [
      { ticker: 'AAPL', quote: quote(), valid_until: '2026-09-04T12:02:00Z', stale_until: '2026-09-04T12:15:00Z' },
      { ticker: 'MSFT', quote: quote('MSFT'), valid_until: '2026-09-04T11:59:00Z', stale_until: '2026-09-04T12:15:00Z' },
      { ticker: 'BAD', quote: { ticker: 'BAD' }, valid_until: '2026-09-04T12:02:00Z', stale_until: '2026-09-04T12:15:00Z' },
    ];
    const db = { from: () => ({ select: () => ({ in: vi.fn(async () => ({ data: rows, error: null })) }) }) };
    const result = await loadSharedQuoteSnapshots(db, ['AAPL', 'MSFT', 'BAD'], new Date('2026-09-04T12:00:00Z'));
    expect(result.fresh.AAPL).toMatchObject({ price: 200 });
    expect(result.fresh.AAPL.stale).toBeUndefined();
    expect(result.stale.MSFT).toMatchObject({ price: 200, stale: true, delayed: true });
    expect(result.fresh.BAD).toBeUndefined();
  });

  it('persists only validated canonical quotes with bounded freshness windows', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    await persistSharedQuoteSnapshots(db, [quote()], new Date('2026-09-04T12:00:00Z'));
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({
      ticker: 'AAPL', source: 'test', valid_until: '2026-09-04T12:01:00.000Z',
      stale_until: '2026-09-04T12:15:00.000Z',
      open_price: 198, high_price: 202, low_price: 197, previous_close: 198,
      volume: 100, amount: 20_000,
    })], { onConflict: 'ticker' });
  });
});
