import type { AssetType, Market, StockUniverse } from '@/lib/supabase/database.types';
import type { AppLocale } from '@/lib/i18n/locale';

export interface WatchlistSecurityIdentity {
  t: string;
  n: string;
  py: string;
  m: Market;
  asset_type: AssetType;
  selectable?: boolean;
  verification_status?: string;
  list_status?: string;
}

export function watchlistSecurityIdentity(
  security: StockUniverse,
  locale: AppLocale,
): WatchlistSecurityIdentity {
  return {
    t: security.ticker,
    n: locale === 'en' && security.name_en ? security.name_en : security.name,
    py: security.pinyin ?? '',
    m: security.market,
    asset_type: security.asset_type,
    selectable: security.is_active && security.list_status === 'listed',
    verification_status: 'verified',
    list_status: security.list_status,
  };
}
