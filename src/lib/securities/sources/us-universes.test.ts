import { describe, expect, it } from 'vitest';
import type { NormalizedSecurity } from '../model';
import { parseNasdaqDirectory } from './nasdaq-directory';
import { parseNasdaqScreener } from './nasdaq-screener';
import { fetchSp500Snapshot } from './sp500';
import {
  buildUsCandidates,
  normalizeUsSymbol,
  selectNasdaqTop500,
  selectUsChina,
  type UsChinaOverrides,
} from './us-universes';

function security(ticker: string, overrides: Partial<NormalizedSecurity> = {}): NormalizedSecurity {
  return {
    ticker,
    symbol: ticker,
    name: `${ticker} Common Stock`,
    name_en: `${ticker} Common Stock`,
    full_name: null,
    pinyin: null,
    market: 'US',
    exchange: 'NASDAQ',
    asset_type: 'stock',
    fund_subtype: null,
    instrument_form: 'common_stock',
    currency: 'USD',
    country_code: 'US',
    industry: 'Software',
    list_status: 'listed',
    list_date: null,
    delist_date: null,
    is_active: true,
    source: 'nasdaq',
    source_updated_at: '2026-07-15T00:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

describe('Nasdaq exchange sources', () => {
  it('normalizes share-class symbols and parses only supported live identities', () => {
    expect(normalizeUsSymbol('BRK/B')).toBe('BRK.B');
    const listed = [
      'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares',
      'AAPL|Apple Inc. Common Stock|Q|N|N|100|N|N',
      'TEST|Test Security Common Stock|Q|Y|N|100|N|N',
      'QQQ|Invesco QQQ ETF|Q|N|N|100|Y|N',
      'File Creation Time: 0715202621:32|||||||',
    ].join('\n');
    const other = [
      'ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol',
      'BABA|Alibaba Group Holding Limited American Depositary Shares|N|BABA|N|100|N|BABA',
      'BRK/B|Berkshire Hathaway Inc. Class B Common Stock|N|BRK/B|N|100|N|BRK/B',
      'OTC1|Unsupported Common Stock|U|OTC1|N|100|N|OTC1',
      'File Creation Time: 0715202621:32|||||||',
    ].join('\n');

    expect(parseNasdaqDirectory(listed, 'nasdaq').map((row) => row.ticker)).toEqual(['AAPL']);
    expect(parseNasdaqDirectory(other, 'other').map((row) => row.ticker)).toEqual(['BABA', 'BRK.B']);
  });

  it('requires the official directory terminator and strict screener fields', () => {
    for (const run of [
      () => parseNasdaqDirectory('Symbol|Security Name\nAAPL|Apple', 'nasdaq'),
      () => parseNasdaqScreener({ data: { rows: [{ symbol: 'AAPL' }] } }, 'NASDAQ'),
    ]) {
      try {
        run();
        throw new Error('expected source schema error');
      } catch (error) {
        expect(error).toMatchObject({ code: 'source_schema' });
      }
    }
  });
});

describe('US universe selection', () => {
  const candidates = Array.from({ length: 505 }, (_, index) => ({
    security: security(`N${String(index).padStart(3, '0')}`),
    market_cap_usd: 1_000_000_000 - index,
  }));

  it('selects a deterministic NASDAQ market-cap top 500', () => {
    const top500 = selectNasdaqTop500(candidates, '2026-07-15');
    expect(top500).toHaveLength(500);
    expect(top500[0]).toMatchObject({ ticker: 'N000', rank: 1 });
    expect(selectNasdaqTop500([...candidates].reverse(), '2026-07-15')).toEqual(top500);
  });

  it('keeps common stocks and ADRs while excluding non-equity forms', () => {
    const directory = [
      { ticker: 'AAPL', rawSymbol: 'AAPL', name: 'Apple Inc. Common Stock', exchange: 'NASDAQ' as const },
      { ticker: 'BABA', rawSymbol: 'BABA', name: 'Alibaba Group American Depositary Shares', exchange: 'NYSE' as const },
      { ticker: 'BADW', rawSymbol: 'BADW', name: 'Bad Corp Warrants', exchange: 'NASDAQ' as const },
      { ticker: 'BADP', rawSymbol: 'BADP', name: 'Bad Corp Preferred Stock', exchange: 'NYSE' as const },
    ];
    const screener = [
      { ticker: 'AAPL', name: 'Apple Inc. Common Stock', exchange: 'NASDAQ' as const, market_cap_usd: 3e12, country_code: 'US', sector: 'Technology', industry: 'Computer Manufacturing' },
      { ticker: 'BABA', name: 'Alibaba Group American Depositary Shares', exchange: 'NYSE' as const, market_cap_usd: 2e11, country_code: 'CN', sector: 'Consumer', industry: 'Retail' },
      { ticker: 'BADW', name: 'Bad Corp Warrants', exchange: 'NASDAQ' as const, market_cap_usd: 1e8, country_code: 'US', sector: null, industry: null },
      { ticker: 'BADP', name: 'Bad Corp Preferred Stock', exchange: 'NYSE' as const, market_cap_usd: null, country_code: 'US', sector: null, industry: null },
    ];

    const built = buildUsCandidates(directory, screener, '2026-07-15');
    expect(built.map((row) => row.security.ticker)).toEqual(['AAPL', 'BABA']);
    expect(built[1].security.instrument_form).toBe('adr');
  });

  it('selects exchange-listed China/Hong Kong equities with reviewed overrides', () => {
    const input = [
      { security: security('BABA', { exchange: 'NYSE', country_code: 'CN', instrument_form: 'adr' }), market_cap_usd: 2e11 },
      { security: security('PDD', { country_code: 'HK', instrument_form: 'adr' }), market_cap_usd: 1.5e11 },
      { security: security('CAYM', { country_code: 'KY' }), market_cap_usd: 1e10 },
      { security: security('NOPE', { country_code: 'CN' }), market_cap_usd: 1e9 },
      { security: security('OTC1', { exchange: 'AMEX', country_code: 'CN', is_active: false }), market_cap_usd: 1e8 },
    ];
    const overrides: UsChinaOverrides = {
      schema_version: 1,
      includes: [{ ticker: 'CAYM', reason: 'China operating company', source_url: 'https://example.com/filing', reviewed_at: '2026-07-15', reviewer: 'osborn' }],
      excludes: [{ ticker: 'NOPE', reason: 'False positive', source_url: 'https://example.com/filing', reviewed_at: '2026-07-15', reviewer: 'osborn' }],
    };
    const tickers = selectUsChina(input, overrides, '2026-07-15').map((row) => row.ticker);
    expect(tickers).toEqual(expect.arrayContaining(['BABA', 'PDD', 'CAYM']));
    expect(tickers).not.toContain('NOPE');
    expect(tickers).not.toContain('OTC1');
  });
});

describe('S&P 500 authorization gate', () => {
  it('requires an authorized official constituent snapshot', async () => {
    await expect(fetchSp500Snapshot({})).rejects.toMatchObject({ code: 'source_authorization_required' });
  });
});
