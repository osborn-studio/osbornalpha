import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedSecurity, SecuritySnapshot } from '../model';
import { callTushare, resolveAsOf, sourceTimestamp, tushareDate, type TushareAdapterOptions } from './tushare-client';

const FIELDS = [
  'ts_code', 'bond_short_name', 'bond_full_name', 'stk_code', 'list_date', 'delist_date', 'maturity_date',
] as const;

interface ConvertibleBondRow extends Record<string, unknown> {
  ts_code: string;
  bond_short_name: string;
  bond_full_name: string | null;
  stk_code: string | null;
  list_date: string | null;
  delist_date: string | null;
  maturity_date: string | null;
}

function exchangeFor(ticker: string): 'SSE' | 'SZSE' | 'BSE' {
  if (ticker.endsWith('.SH')) return 'SSE';
  if (ticker.endsWith('.SZ')) return 'SZSE';
  return 'BSE';
}

export async function fetchConvertibleBondSnapshot(options: TushareAdapterOptions = {}): Promise<SecuritySnapshot> {
  const asOf = resolveAsOf(options.asOf);
  const rows = await callTushare<ConvertibleBondRow>({
    apiName: 'cb_basic',
    params: { ts_code: options.tsCode },
    fields: FIELDS,
    token: options.token,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  const securities = rows.flatMap((row): NormalizedSecurity[] => {
    const ticker = normalizeSecurityTicker(row.ts_code, 'A');
    const listDate = tushareDate(row.list_date);
    const delistDate = tushareDate(row.delist_date);
    if (!ticker || !listDate || listDate > asOf || (delistDate && delistDate <= asOf)) return [];
    return [{
      ticker,
      symbol: ticker.slice(0, 6),
      name: row.bond_short_name,
      name_en: null,
      full_name: row.bond_full_name,
      pinyin: null,
      market: 'A',
      exchange: exchangeFor(ticker),
      asset_type: 'convertible_bond',
      fund_subtype: null,
      instrument_form: 'bond',
      currency: 'CNY',
      country_code: 'CN',
      industry: null,
      list_status: 'listed',
      list_date: listDate,
      delist_date: delistDate,
      is_active: true,
      source: 'tushare',
      source_updated_at: sourceTimestamp(asOf),
      metadata: {
        underlying_ticker: row.stk_code,
        maturity_date: tushareDate(row.maturity_date),
      },
    }];
  }).sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    source: 'tushare',
    scope: 'a_cb',
    asOf,
    securities,
    aliases: securities.flatMap((security) => buildAliases({ ...security, source: 'tushare' })),
    memberships: securities.map((security) => ({
      ticker: security.ticker,
      universe: 'a_cb',
      rank: null,
      market_cap_usd: null,
      as_of_date: asOf,
      is_active: true,
      source: 'tushare',
    })),
  };
}
