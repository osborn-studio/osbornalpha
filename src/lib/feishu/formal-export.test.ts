import { describe, expect, it } from 'vitest';
import { readFormalExport } from './formal-export';

// In-memory PostgREST stand-in: eq / in / order / range over plain rows.
function fakeDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => { rows = rows.filter((r) => r[column] === value); return builder; },
        in: (column: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[column])); return builder; },
        order: (column: string) => { rows.sort((a, b) => String(a[column]).localeCompare(String(b[column]))); return builder; },
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
      };
      return builder;
    },
  };
}

const owner = 'owner-1';
const rec = (id: string, analyst: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: owner, analyst_id: analyst, ticker: '00300.HK', market: 'HK', action: 'buy',
  recommended_at: `2026-11-2${id.slice(-1)}T07:00:00Z`, created_at: `2026-11-2${id.slice(-1)}T07:01:00Z`, withdrawn_at: null,
  reference_price: null, target_price: '120', stop_loss: null, confidence: 70, horizon: 'mid', rationale: '出口修复', ...extra,
});

describe('readFormalExport', () => {
  const db = fakeDb({
    analyst_profiles: [{ id: 'a-lina', user_id: owner, display_name: 'lina' }, { id: 'a-bin', user_id: owner, display_name: 'bin' }],
    recommendations: [
      rec('r1', 'a-lina'), rec('r2', 'a-lina', { withdrawn_at: '2026-11-25T01:00:00Z' }), rec('r3', 'a-bin'),
      rec('r4', 'a-other'), { ...rec('r5', 'a-lina'), user_id: 'someone-else' },
    ],
    recommendation_scores: [{ recommendation_id: 'r1', user_id: owner, hit: true, score: '12.5', forward_5d_pct: '1.2', forward_20d_pct: null, forward_60d_pct: null }],
    decisions: [
      { id: 'd1', user_id: owner, recommendation_id: 'r1', status: 'executed', decided_at: '2026-11-21T08:00:44Z' },
      { id: 'd3', user_id: owner, recommendation_id: 'r3', status: 'cancelled', decided_at: '2026-11-23T08:00:00Z' },
    ],
    trades: [
      { id: 't1', user_id: owner, decision_id: 'd1', ticker: '00300.HK', direction: 'buy', price: '102.8', quantity: '100', fee: '0', currency: 'HKD', executed_at: '2026-11-21T08:00:44Z' },
      { id: 't-manual', user_id: owner, decision_id: null, ticker: '00300.HK', direction: 'buy', price: '100', quantity: '50', fee: '0', currency: 'HKD', executed_at: '2026-11-22T08:00:00Z' },
    ],
    positions: [{ user_id: owner, ticker: '00300.HK', shares: '150', avg_cost: '101.87', realized_pnl: '0', currency: 'HKD' }],
  });

  it('returns only the bound analysts of the owner, with adoption, scores and linked trades', async () => {
    const out = await readFormalExport(db, { ownerId: owner, analysts: new Map([['lina', 'a-lina'], ['bin', 'a-bin']]) });
    expect(out.analysts).toEqual([{ key: 'lina', analystId: 'a-lina', displayName: 'lina' }, { key: 'bin', analystId: 'a-bin', displayName: 'bin' }]);
    expect(out.recommendations.map((r) => [r.id, r.analystKey, r.adopted, r.withdrawnAt !== null])).toEqual([
      ['r1', 'lina', true, false], ['r2', 'lina', false, true], ['r3', 'bin', false, false],
    ]);
    expect(out.recommendations[0]).toMatchObject({ targetPrice: 120, confidence: 70, horizon: 'mid', rationale: '出口修复', decidedAt: '2026-11-21T08:00:44Z',
      score: { hit: true, score: 12.5, forward5dPct: 1.2, forward20dPct: null } });
    expect(out.trades).toEqual([{ id: 't1', recommendationId: 'r1', analystKey: 'lina', ticker: '00300.HK', direction: 'buy',
      price: 102.8, quantity: 100, fee: 0, currency: 'HKD', executedAt: '2026-11-21T08:00:44Z' }]);
  });

  it('flags positions that also contain trades outside the bound analysts', async () => {
    const out = await readFormalExport(db, { ownerId: owner, analysts: new Map([['lina', 'a-lina']]) });
    expect(out.positions).toEqual([{ ticker: '00300.HK', shares: 150, avgCost: 101.87, realizedPnl: 0, currency: 'HKD', attributedOnly: false }]);
  });

  it('is empty when no analyst is bound', async () => {
    expect(await readFormalExport(db, { ownerId: owner, analysts: new Map() }))
      .toEqual({ ownerId: owner, analysts: [], recommendations: [], trades: [], positions: [] });
  });
});
