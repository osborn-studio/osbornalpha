import { describe, expect, it, vi } from 'vitest';
import type { SecuritySearchRow } from '@/lib/supabase/database.types';
import { searchSecurities } from './search';

describe('searchSecurities', () => {
  it('maps deterministic RPC order and preserves ambiguous aliases', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { t: '002463.SZ', n: '沪电股份', py: 'hdgf', m: 'A', asset_type: 'stock', exchange: 'SZSE', list_status: 'listed', match_kind: 'exact_symbol', verification_status: 'verified', selectable: true },
        { t: '02463.HK', n: 'Shared Alias', py: '', m: 'HK', asset_type: 'stock', exchange: 'HKEX', list_status: 'listed', match_kind: 'alias', verification_status: 'verified', selectable: true },
      ] satisfies SecuritySearchRow[],
      error: null,
    }));
    const results = await searchSecurities({ rpc }, '002463', 10);
    expect(results.map((row) => row.t)).toEqual(['002463.SZ', '02463.HK']);
    expect(results[0]).toMatchObject({ match_kind: 'exact_symbol', selectable: true });
  });

  it('preserves inactive exact identities as non-selectable', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ t: 'OLD', n: 'Old Co', py: '', m: 'US', asset_type: 'stock', exchange: 'NYSE', list_status: 'delisted', match_kind: 'exact_ticker', verification_status: 'inactive', selectable: false }] satisfies SecuritySearchRow[],
      error: null,
    }));
    expect(await searchSecurities({ rpc }, 'OLD', 10)).toEqual([
      expect.objectContaining({ t: 'OLD', selectable: false, verification_status: 'inactive' }),
    ]);
  });
});
