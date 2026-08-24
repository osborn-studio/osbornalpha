import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedSecurity, SecuritySnapshot } from '../model';
import { callTushare, resolveAsOf, sourceTimestamp, tushareDate, type TushareAdapterOptions } from './tushare-client';

const FIELDS = [
  'ts_code', 'symbol', 'name', 'area', 'industry', 'fullname', 'market', 'exchange',
  'curr_type', 'list_status', 'list_date', 'delist_date',
] as const;

interface AShareRow extends Record<string, unknown> {
  ts_code: string;
  symbol: string;
  name: string;
  area: string | null;
  industry: string | null;
  fullname: string | null;
  market: string;
  exchange: string;
  curr_type: string;
  list_status: string;
  list_date: string | null;
  delist_date: string | null;
}

function exchangeFor(ticker: string): NormalizedSecurity['exchange'] {
  if (ticker.endsWith('.SH')) return 'SSE';
  if (ticker.endsWith('.SZ')) return 'SZSE';
  return 'BSE';
}

export async function fetchAShareSnapshot(options: TushareAdapterOptions = {}): Promise<SecuritySnapshot> {
  const asOf = resolveAsOf(options.asOf);
  const rows = await callTushare<AShareRow>({
    apiName: 'stock_basic',
    params: { list_status: 'L', ts_code: options.tsCode },
    fields: FIELDS,
    token: options.token,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  const securities = rows.flatMap((row): NormalizedSecurity[] => {
    if (row.list_status !== 'L' || /^(200|900)/.test(row.symbol) || row.market === 'CDR') return [];
    const ticker = normalizeSecurityTicker(row.ts_code, 'A');
    if (!ticker) return [];
    return [{
      ticker,
      symbol: row.symbol,
      name: row.name,
      name_en: null,
      full_name: row.fullname,
      pinyin: null,
      market: 'A',
      exchange: exchangeFor(ticker),
      asset_type: 'stock',
      fund_subtype: null,
      instrument_form: 'common_stock',
      currency: 'CNY',
      country_code: 'CN',
      industry: row.industry,
      list_status: 'listed',
      list_date: tushareDate(row.list_date),
      delist_date: tushareDate(row.delist_date),
      is_active: true,
      source: 'tushare',
      source_updated_at: sourceTimestamp(asOf),
      metadata: { area: row.area, provider_market: row.market },
    }];
  });

  return {
    source: 'tushare',
    scope: 'a_stock',
    asOf,
    securities,
    aliases: securities.flatMap((security) => buildAliases({ ...security, source: 'tushare' })),
    memberships: securities.map((security) => ({
      ticker: security.ticker,
      universe: 'a_stock',
      rank: null,
      market_cap_usd: null,
      as_of_date: asOf,
      is_active: true,
      source: 'tushare',
    })),
  };
}
