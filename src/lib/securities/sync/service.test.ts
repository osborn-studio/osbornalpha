import { describe, expect, it, vi } from 'vitest';
import type { SecuritySnapshot, SecurityUniverse } from '../model';
import { syncSecurityScopes } from './service';

function minimalSnapshot(scope: SecurityUniverse): SecuritySnapshot {
  return { source: 'fixture', scope, asOf: '2026-07-15', securities: [], aliases: [], memberships: [] };
}

describe('syncSecurityScopes', () => {
  it('isolates source failures so one scope cannot suppress another', async () => {
    const loadSnapshot = vi.fn(async (scope: SecurityUniverse) => {
      if (scope === 'sp500') throw Object.assign(new Error('authorization required'), { code: 'source_authorization_required' });
      return minimalSnapshot(scope);
    });
    const results = await syncSecurityScopes({
      scopes: ['a_stock', 'sp500'],
      dryRun: true,
      asOf: '2026-07-15',
    }, {
      loadSnapshot,
      loadPrevious: vi.fn(async () => ({ previousCount: 0, previousMemberships: [] })),
    });

    expect(results).toHaveLength(2);
    expect(results.find((row) => row.scope === 'sp500')).toMatchObject({ status: 'failed', error_code: 'source_authorization_required' });
    expect(results.find((row) => row.scope === 'a_stock')).toMatchObject({ status: 'rejected' });
  });
});
