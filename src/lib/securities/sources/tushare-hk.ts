import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedSecurity, SecuritySnapshot } from '../model';
import { callTushare, resolveAsOf, sourceTimestamp, tushareDate, type TushareAdapterOptions } from './tushare-client';

const FIELDS = [
  'ts_code', 'name', 'fullname', 'enname', 'cn_spell', 'market', 'list_status', 'list_date', 'delist_date', 'curr_type',
] as const;

interface HongKongRow extends Record<string, unknown> {
  ts_code: string;
  name: string;
  fullname: string | null;
  enname: string | null;
  cn_spell: string | null;
  market: string;
  list_status: string;
  list_date: string | null;
  delist_date: string | null;
  curr_type: string | null;
}

export async function fetchHongKongMainBoardSnapshot(options: TushareAdapterOptions = {}): Promise<SecuritySnapshot> {
  const asOf = resolveAsOf(options.asOf);
  const rows = await callTushare<HongKongRow>({
    apiName: 'hk_basic',
    params: { list_status: 'L' },
    fields: FIELDS,
    token: options.token,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  const securities = rows.flatMap((row): NormalizedSecurity[] => {
    if (row.list_status !== 'L' || row.market !== '主板') return [];
    const ticker = normalizeSecurityTicker(row.ts_code, 'HK');
    if (!ticker) return [];
    return [{
      ticker,
      symbol: ticker.slice(0, 5),
      name: row.name,
      name_en: row.enname,
      full_name: row.fullname,
      pinyin: row.cn_spell?.toLocaleLowerCase() ?? null,
      market: 'HK',
      exchange: 'HKEX',
      asset_type: 'stock',
      fund_subtype: null,
      instrument_form: 'common_stock',
      currency: 'HKD',
      country_code: 'HK',
      industry: null,
      list_status: 'listed',
      list_date: tushareDate(row.list_date),
      delist_date: tushareDate(row.delist_date),
      is_active: true,
      source: 'tushare',
      source_updated_at: sourceTimestamp(asOf),
      metadata: { provider_market: row.market, provider_currency: row.curr_type },
    }];
  }).sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    source: 'tushare',
    scope: 'hk_main',
    asOf,
    securities,
    aliases: securities.flatMap((security) => buildAliases({
      ...security,
      source: 'tushare',
      vendorAliases: security.pinyin ? [security.pinyin] : [],
    })),
    memberships: securities.map((security) => ({
      ticker: security.ticker,
      universe: 'hk_main',
      rank: null,
      market_cap_usd: null,
      as_of_date: asOf,
      is_active: true,
      source: 'tushare',
    })),
  };
}
