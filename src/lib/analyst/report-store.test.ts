import { describe, expect, it } from 'vitest';
import { loadAnalystReport } from './report-store';

// A one-row result cap exercises paging past a shorter configured PostgREST limit.
function fixture(tables: Record<string, Array<{ id: string } & Record<string, unknown>>>) {
  const calls: { table: string; fields: string; filters: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let after = '';
      return {
        select(fields: string) { calls.push({ table, fields, filters }); return this; },
        eq(key: string, value: unknown) { filters[key] = value; return this; },
        in(key: string, values: string[]) { filters[key] = values; return this; },
        gt(_key: string, value: string) { after = value; return this; },
        order() { return this; },
        limit() { return this; },
        abortSignal() { return Promise.resolve({ data: tables[table].filter(row => row.id > after).slice(0, 1), error: null }); },
      };
    },
  };
  return { db: db as unknown as Parameters<typeof loadAnalystReport>[0], calls };
}

const owner = 'owner';
const signal = new AbortController().signal;
const profile = { id: 'a', user_id: owner, display_name: 'A', is_self: false };
const rec = { id: 'r1', user_id: owner, analyst_id: 'a', ticker: 'TEST', market: 'US', action: 'buy', recommended_at: '2025-01-01T10:00Z',
  withdrawn_at: null, reference_price: '90.25', target_price: null, stop_loss: null, assessment: null };
const fill = { id: 't1', user_id: owner, decision_id: 'd', ticker: 'TEST', direction: 'buy', price: '91', quantity: '2', fee: '0', currency: 'USD',
  executed_at: '2025-02-01T10:00Z', decision: { id: 'd', user_id: owner, recommendation_id: 'r1' } };

describe('analyst report data', () => {
  it('preserves pending and withdrawn rows, real zero/false scores and all associated partial fills across pages', async () => {
    const score = { recommendation_id: 'r2', user_id: owner, score: '0', hit: false, scored_at: '2025-02-20T10:00Z',
      forward_5d_pct: '0', forward_20d_pct: '-3', forward_60d_pct: null };
    const { db, calls } = fixture({ analyst_profiles: [profile, { ...profile, id: 'b', display_name: 'B' }],
      recommendations: [rec, { ...rec, id: 'r2', analyst_id: 'b', withdrawn_at: '2025-02-25T10:00Z', assessment: [score] }],
      trades: [fill, { ...fill, id: 't2' }] });
    const report = await loadAnalystReport(db, owner, ['a', 'a', 'b'], signal);
    expect(report.analysts).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    expect(report.recommendations[0]).toMatchObject({ id: 'r1', hit: null, score: null, referencePrice: 90.25 });
    expect(report.recommendations[1]).toMatchObject({ id: 'r2', hit: false, score: 0, forward5dPct: 0, forward20dPct: -3, withdrawnAt: '2025-02-25T10:00Z' });
    expect(report.trades.map(t => t.id)).toEqual(['t1', 't2']);
    expect(report.trades[0]).toMatchObject({ decisionId: 'd', recommendationId: 'r1', analystId: 'a', price: 91, quantity: 2, fee: 0 });
    expect(calls.find(c => c.table === 'analyst_profiles')?.filters).toEqual({ user_id: owner, is_self: false, id: ['a', 'b'] });
    expect(calls.find(c => c.table === 'recommendations')?.filters).toEqual({ user_id: owner, 'assessment.user_id': owner, analyst_id: ['a', 'b'] });
    expect(calls.find(c => c.table === 'trades')?.filters).toEqual({ user_id: owner, 'decision.user_id': owner, 'decision.recommendation_id': ['r1', 'r2'] });
  });

  it('does not open any data query without configured analysts, and rejects a broken association', async () => {
    const empty = fixture({});
    expect(await loadAnalystReport(empty.db, owner, [], signal)).toMatchObject({ analysts: [], recommendations: [], trades: [] });
    expect(empty.calls).toEqual([]);
    const { db } = fixture({ analyst_profiles: [profile], recommendations: [rec],
      trades: [{ ...fill, decision: { ...fill.decision, recommendation_id: 'out-of-group' } }] });
    await expect(loadAnalystReport(db, owner, ['a'], signal)).rejects.toThrow('Unexpected report trade');
  });
});
