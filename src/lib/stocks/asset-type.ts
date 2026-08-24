import type { AssetType } from '@/lib/supabase/database.types';

export interface AssetTypeInput {
  ticker: string;
  name?: string;
  securityTypeName?: string;
  classify?: string;
  assetType?: AssetType;
}

export function classifyAssetType(input: AssetTypeInput): AssetType {
  if (input.assetType && input.assetType !== 'unknown') return input.assetType;
  const text = [input.name, input.securityTypeName, input.classify]
    .filter(Boolean)
    .join(' ');
  const code = input.ticker.toUpperCase().split('.')[0];

  if (/可转债|转债|convertible/i.test(text) || /^(110|111|113|118|123|127|128)\d{3}$/.test(code)) {
    return 'convertible_bond';
  }
  if (/ETF|交易型开放式/i.test(text) || /^(51|56|58|15)\d{4}$/.test(code)) {
    return 'etf';
  }
  if (/指数|index/i.test(text)) return 'index';
  if (/基金|fund/i.test(text)) return 'fund';
  if (
    /^[A-Z][A-Z.]{0,9}$/.test(input.ticker.toUpperCase()) ||
    /\.(SH|SZ|BJ|HK|TW|TWO|T|KS|KQ)$/i.test(input.ticker)
  ) {
    return 'stock';
  }
  return 'unknown';
}
