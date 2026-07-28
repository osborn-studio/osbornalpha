import { describe, it, expect } from 'vitest';
import { unrealizedPnl, portfolioSummary, latestOpenDecision } from './pnl';
import type { Position, Decision } from '@/lib/supabase/database.types';

const pos = (o: Partial<Position>): Position => ({
  user_id: 'u', ticker: '300750', shares: 100, avg_cost: 400,
  realized_pnl: 0, currency: 'CNY', opened_at: '2026-01-01', closed_at: null, ...o,
});

describe('unrealizedPnl', () => {
  it('computes value and pct from live price', () => {
    const r = unrealizedPnl(pos({}), 480);
    expect(r).toEqual({ value: 8000, pct: 20 });
  });
  it('returns null without a price or for closed positions', () => {
    expect(unrealizedPnl(pos({}), null)).toBeNull();
    expect(unrealizedPnl(pos({ shares: 0, closed_at: '2026-02-01' }), 480)).toBeNull();
  });
});

describe('portfolioSummary', () => {
  it('aggregates market value, unrealized and realized', () => {
    const s = portfolioSummary(
      [pos({}), pos({ ticker: 'NVDA', shares: 10, avg_cost: 100, realized_pnl: 50, currency: 'USD' })],
      { '300750': 480, NVDA: 120 },
    );
    expect(s.marketValue).toBe(100 * 480 + 10 * 120);
    expect(s.unrealized).toBe(8000 + 200);
    expect(s.realized).toBe(50);
    expect(s.openCount).toBe(2);
  });
  it('skips closed positions and missing quotes gracefully', () => {
    const s = portfolioSummary([pos({ shares: 0, closed_at: 'x', realized_pnl: 300 }), pos({ ticker: 'X' })], {});
    expect(s.openCount).toBe(1);
    expect(s.unrealized).toBe(0); // no quote for X yet
    expect(s.realized).toBe(300);
    expect(s.marketValue).toBe(0);
  });
});

describe('latestOpenDecision', () => {
  const d = (o: Partial<Decision>): Decision => ({
    id: 'd1', user_id: 'u', ticker: '300750', market: 'A', action: 'buy', thesis: null,
    confidence: null, entry_low: null, entry_high: null, target_price: 520, stop_loss: 418,
    horizon: null, source_type: 'manual', source_ref: null, status: 'open',
    decided_at: '2026-06-28T00:00:00Z', expires_at: null, ...o,
  });
  it('picks the newest open decision for the ticker', () => {
    const got = latestOpenDecision(
      [d({ id: 'a', decided_at: '2026-06-01T00:00:00Z' }), d({ id: 'b', decided_at: '2026-06-28T00:00:00Z' }),
       d({ id: 'c', status: 'executed', decided_at: '2026-06-30T00:00:00Z' }), d({ id: 'x', ticker: 'NVDA' })],
      '300750',
    );
    expect(got?.id).toBe('b');
  });
  it('returns null when none open', () => {
    expect(latestOpenDecision([d({ status: 'cancelled' })], '300750')).toBeNull();
  });
});
