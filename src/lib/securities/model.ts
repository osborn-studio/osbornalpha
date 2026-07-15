import type { AssetType, Market } from '@/lib/supabase/database.types';

export type CoreMarket = Extract<Market, 'A' | 'HK' | 'US'>;

export type SecurityUniverse =
  | 'a_stock'
  | 'a_exchange_fund'
  | 'a_cb'
  | 'hk_main'
  | 'sp500'
  | 'nasdaq_top500'
  | 'us_china';

export type FundSubtype =
  | 'etf'
  | 'lof'
  | 'closed_end'
  | 'reit'
  | 'other_exchange_fund';

export type InstrumentForm = 'common_stock' | 'adr' | 'share_class' | 'fund_unit' | 'bond';

export type SecurityExchange = 'SSE' | 'SZSE' | 'BSE' | 'HKEX' | 'NASDAQ' | 'NYSE' | 'AMEX';
export type SecurityCurrency = 'CNY' | 'HKD' | 'USD';
export type SecurityListStatus = 'listed' | 'paused' | 'delisted' | 'pending';

export interface NormalizedSecurity {
  ticker: string;
  symbol: string;
  name: string;
  name_en: string | null;
  full_name: string | null;
  pinyin: string | null;
  market: CoreMarket;
  exchange: SecurityExchange;
  asset_type: AssetType;
  fund_subtype: FundSubtype | null;
  instrument_form: InstrumentForm;
  currency: SecurityCurrency;
  country_code: string | null;
  industry: string | null;
  list_status: SecurityListStatus;
  list_date: string | null;
  delist_date: string | null;
  is_active: boolean;
  source: string;
  source_updated_at: string;
  metadata: Record<string, string | number | boolean | null>;
}

export type SecurityAliasType = 'symbol' | 'vendor' | 'former_symbol' | 'name' | 'pinyin';

export interface NormalizedAlias {
  alias: string;
  ticker: string;
  alias_type: SecurityAliasType;
  source: string;
}

export interface NormalizedMembership {
  ticker: string;
  universe: SecurityUniverse;
  rank: number | null;
  market_cap_usd: number | null;
  as_of_date: string;
  is_active: boolean;
  source: string;
}

export interface SecuritySnapshot {
  source: string;
  scope: SecurityUniverse;
  asOf: string;
  securities: NormalizedSecurity[];
  aliases: NormalizedAlias[];
  memberships: NormalizedMembership[];
}
