import { describe, expect, it } from 'vitest';
import { aggregateSecuritiesHealth } from './securities-health';

describe('aggregateSecuritiesHealth', () => {
  it('summarizes scope health, canaries, backlog, and search behavior', () => {
    const response = aggregateSecuritiesHealth({
      now: '2026-07-15T12:00:00.000Z',
      memberships: [
        { ticker: '002463.SZ', universe: 'a_stock', is_active: true, as_of_date: '2026-07-15' },
        { ticker: '600519.SH', universe: 'a_stock', is_active: true, as_of_date: '2026-07-15' },
      ],
      runs: [
        { scope: 'a_stock', status: 'success', completed_at: '2026-07-15T10:00:00.000Z', source_as_of: '2026-07-15', inserted_count: 2, updated_count: 8, deactivated_count: 0, error_code: null },
        { scope: 'a_stock', status: 'rejected', completed_at: '2026-07-14T10:00:00.000Z', source_as_of: '2026-07-14', inserted_count: 0, updated_count: 0, deactivated_count: 0, error_code: 'below_minimum' },
      ],
      pendingCandidates: 3,
      events: [
        { event_name: 'stock_search_completed', metadata: { results: 2 } },
        { event_name: 'stock_search_completed', metadata: { results: 0 } },
        { event_name: 'security_resolve_started', metadata: {} },
        { event_name: 'security_resolve_completed', metadata: {} },
        { event_name: 'stock_force_added', metadata: {} },
        { event_name: 'watchlist_stock_added', metadata: {} },
      ],
      canaries: [
        { ticker: '002463.SZ', is_active: true, list_status: 'listed' },
        { ticker: 'AAPL', is_active: false, list_status: 'pending' },
      ],
    });

    expect(response.scopes.find((row) => row.scope === 'a_stock')).toMatchObject({
      active_count: 2,
      changed_count: 10,
      deactivated_count: 0,
      data_age_hours: 2,
      status: 'healthy',
    });
    expect(response.candidate_backlog).toBe(3);
    expect(response.search).toMatchObject({ hit_rate: 0.5, zero_result_rate: 0.5, resolver_completion_rate: 1, legacy_force_add_ratio: 0.5 });
    expect(response.canaries).toContainEqual({ ticker: 'AAPL', healthy: false });
  });
});
