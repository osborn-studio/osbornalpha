import { describe, expect, it, vi } from 'vitest';
import type { SecuritySnapshot } from './model';
import { discoverExternalCandidate, validateTrustedResolution } from './discovery';

function trustedSnapshot(): SecuritySnapshot {
  return {
    source: 'tushare',
    scope: 'a_stock',
    asOf: '2026-07-15',
    securities: [{
      ticker: '002463.SZ', symbol: '002463', name: '沪电股份', name_en: null, full_name: null,
      pinyin: 'hdgf', market: 'A', exchange: 'SZSE', asset_type: 'stock', fund_subtype: null,
      instrument_form: 'common_stock', currency: 'CNY', country_code: 'CN', industry: null,
      list_status: 'listed', list_date: null, delist_date: null, is_active: true, source: 'tushare',
      source_updated_at: '2026-07-15T00:00:00.000Z', metadata: {},
    }],
    aliases: [{ alias: '002463', ticker: '002463.SZ', alias_type: 'symbol', source: 'tushare' }],
    memberships: [{ ticker: '002463.SZ', universe: 'a_stock', rank: null, market_cap_usd: null, as_of_date: '2026-07-15', is_active: true, source: 'tushare' }],
  };
}

describe('security discovery', () => {
  it('accepts only a unique trusted identity with approved membership', () => {
    expect(validateTrustedResolution(trustedSnapshot(), '002463.SZ')).toMatchObject({ ticker: '002463.SZ' });
    const invalid = trustedSnapshot();
    invalid.memberships = [];
    expect(() => validateTrustedResolution(invalid, '002463.SZ')).toThrowError(/approved membership/i);
  });

  it('accepts an exact Nasdaq identity without inventing curated-universe membership', () => {
    const exact = trustedSnapshot();
    exact.securities[0] = {
      ...exact.securities[0],
      ticker: 'DFDV',
      symbol: 'DFDV',
      name: 'DeFi Development Corp. Common Stock',
      name_en: 'DeFi Development Corp. Common Stock',
      full_name: 'DeFi Development Corp. - Common Stock',
      pinyin: null,
      market: 'US',
      exchange: 'NASDAQ',
      currency: 'USD',
      country_code: 'US',
      source: 'nasdaq',
    };
    exact.aliases = [{ alias: 'dfdv', ticker: 'DFDV', alias_type: 'symbol', source: 'nasdaq' }];
    exact.memberships = [];

    expect(validateTrustedResolution(exact, 'DFDV')).toMatchObject({
      ticker: 'DFDV',
      memberships: [],
    });
  });

  it('maps Eastmoney-only matches to non-selectable candidates', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      QuotationCodeTable: { Data: [{ Code: '002463', Name: '沪电股份', PinYin: 'HDGF', QuoteID: '0.002463', SecurityTypeName: 'A股', Classify: 'AStock' }] },
    }), { status: 200 })) as typeof fetch;
    const candidate = await discoverExternalCandidate('002463.SZ', fetchImpl);
    expect(candidate).toMatchObject({ ticker: '002463.SZ', verification_status: 'external-unverified', selectable: false });
  });
});
