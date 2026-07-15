import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { FundSubtype, NormalizedSecurity, SecuritySnapshot } from '../model';
import { callTushare, resolveAsOf, sourceTimestamp, tushareDate, type TushareAdapterOptions } from './tushare-client';

const FUND_FIELDS = [
  'ts_code', 'name', 'fund_type', 'invest_type', 'type', 'market', 'status', 'list_date', 'delist_date',
] as const;
const ETF_FIELDS = [
  'ts_code', 'csname', 'extname', 'cname', 'index_code', 'list_date', 'list_status', 'exchange',
] as const;

interface FundRow extends Record<string, unknown> {
  ts_code: string;
  name: string;
  fund_type: string;
  invest_type: string | null;
  type: string | null;
  market: string;
  status: string;
  list_date: string | null;
  delist_date: string | null;
}

interface EtfRow extends Record<string, unknown> {
  ts_code: string;
  csname: string;
  extname: string | null;
  cname: string | null;
  index_code: string | null;
  list_date: string | null;
  list_status: string;
  exchange: string;
}

function exchangeFor(ticker: string): 'SSE' | 'SZSE' | 'BSE' {
  if (ticker.endsWith('.SH')) return 'SSE';
  if (ticker.endsWith('.SZ')) return 'SZSE';
  return 'BSE';
}

function subtypeFor(row: FundRow): FundSubtype {
  return row.fund_type.toLocaleLowerCase().includes('reit') ? 'reit' : 'other_exchange_fund';
}

export async function fetchExchangeFundSnapshot(options: TushareAdapterOptions = {}): Promise<SecuritySnapshot> {
  const asOf = resolveAsOf(options.asOf);
  const common = {
    token: options.token,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  };
  const [fundRows, etfRows] = await Promise.all([
    callTushare<FundRow>({ apiName: 'fund_basic', params: { market: 'E', status: 'L', ts_code: options.tsCode }, fields: FUND_FIELDS, ...common }),
    callTushare<EtfRow>({ apiName: 'etf_basic', params: { list_status: 'L', ts_code: options.tsCode }, fields: ETF_FIELDS, ...common }),
  ]);

  const etfs = new Map(etfRows.filter((row) => row.list_status === 'L').map((row) => [row.ts_code, row]));
  const securitiesByTicker = new Map<string, NormalizedSecurity>();

  for (const row of fundRows) {
    if (row.market !== 'E' || row.status !== 'L') continue;
    const ticker = normalizeSecurityTicker(row.ts_code, 'A');
    if (!ticker) continue;
    const etf = etfs.get(row.ts_code);
    const fundSubtype = etf ? 'etf' : subtypeFor(row);
    securitiesByTicker.set(ticker, {
      ticker,
      symbol: ticker.slice(0, 6),
      name: etf?.csname || row.name,
      name_en: null,
      full_name: etf?.cname || etf?.extname || null,
      pinyin: null,
      market: 'A',
      exchange: exchangeFor(ticker),
      asset_type: etf ? 'etf' : 'fund',
      fund_subtype: fundSubtype,
      instrument_form: 'fund_unit',
      currency: 'CNY',
      country_code: 'CN',
      industry: null,
      list_status: 'listed',
      list_date: tushareDate(etf?.list_date ?? row.list_date),
      delist_date: tushareDate(row.delist_date),
      is_active: true,
      source: 'tushare',
      source_updated_at: sourceTimestamp(asOf),
      metadata: {
        fund_type: row.fund_type,
        invest_type: row.invest_type,
        legal_type: row.type,
        index_code: etf?.index_code ?? null,
      },
    });
  }

  for (const row of etfs.values()) {
    const ticker = normalizeSecurityTicker(row.ts_code, 'A');
    if (!ticker || securitiesByTicker.has(ticker)) continue;
    securitiesByTicker.set(ticker, {
      ticker,
      symbol: ticker.slice(0, 6),
      name: row.csname,
      name_en: null,
      full_name: row.cname || row.extname || null,
      pinyin: null,
      market: 'A',
      exchange: exchangeFor(ticker),
      asset_type: 'etf',
      fund_subtype: 'etf',
      instrument_form: 'fund_unit',
      currency: 'CNY',
      country_code: 'CN',
      industry: null,
      list_status: 'listed',
      list_date: tushareDate(row.list_date),
      delist_date: null,
      is_active: true,
      source: 'tushare',
      source_updated_at: sourceTimestamp(asOf),
      metadata: { index_code: row.index_code },
    });
  }

  const securities = [...securitiesByTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  return {
    source: 'tushare',
    scope: 'a_exchange_fund',
    asOf,
    securities,
    aliases: securities.flatMap((security) => buildAliases({ ...security, source: 'tushare' })),
    memberships: securities.map((security) => ({
      ticker: security.ticker,
      universe: 'a_exchange_fund',
      rank: null,
      market_cap_usd: null,
      as_of_date: asOf,
      is_active: true,
      source: 'tushare',
    })),
  };
}
