import { describe, expect, it, vi } from 'vitest';
import { canAddResult, nextSearchAction, validateSelectableSecurities } from './security-validation';

const verified = {
  t: '002463.SZ',
  n: '沪电股份',
  selectable: true,
  verification_status: 'verified',
};

describe('watchlist security validation', () => {
  it('chooses resolve, select, or wait without a force-add state', () => {
    expect(nextSearchAction({ localResults: [], query: '002463' })).toBe('resolve');
    expect(nextSearchAction({ localResults: [verified], query: '002463' })).toBe('select');
    expect(nextSearchAction({ localResults: [], query: '沪电股份' })).toBe('wait');
    expect(canAddResult({ ...verified, selectable: false })).toBe(false);
  });

  it('resolves a complete ticker when only unrelated fuzzy results exist', () => {
    const fuzzyHongKongResult = {
      t: '01072.HK',
      n: '东方电气',
      selectable: true,
      verification_status: 'verified',
    };

    expect(nextSearchAction({
      localResults: [fuzzyHongKongResult],
      query: 'DFDV',
    })).toBe('resolve');
  });

  it('canonicalizes requested forms and accepts only active listed master rows', async () => {
    const load = vi.fn(async () => [
      { ticker: '002463.SZ', is_active: true, list_status: 'listed', source: 'tushare' },
      { ticker: 'OLD', is_active: false, list_status: 'delisted', source: 'nasdaq' },
    ]);
    const result = await validateSelectableSecurities(['002463', 'OLD', 'MISSING'], load);
    expect(result.canonicalTickers).toEqual(['002463.SZ']);
    expect(result.rejected).toEqual(['OLD', 'MISSING']);
    expect(result.valid).toBe(false);
  });

  it('rejects pending legacy identities', async () => {
    const result = await validateSelectableSecurities(['00700.HK'], async () => [{
      ticker: '00700.HK', is_active: false, list_status: 'pending', source: 'legacy-watchlist',
    }]);
    expect(result).toMatchObject({ valid: false, rejected: ['00700.HK'] });
  });
});
