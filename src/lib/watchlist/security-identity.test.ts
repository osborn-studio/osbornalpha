import { describe, expect, it } from 'vitest';
import type { StockUniverse } from '@/lib/supabase/database.types';
import { watchlistSecurityIdentity } from './security-identity';

const security = {
  ticker: '00700.HK', name: '腾讯控股', name_en: 'Tencent Holdings', pinyin: 'tengxun',
  market: 'HK', asset_type: 'stock', is_active: true, list_status: 'listed',
} as StockUniverse;

describe('watchlist security identity', () => {
  it('uses the localized security-master name without changing identity fields', () => {
    expect(watchlistSecurityIdentity(security, 'zh')).toMatchObject({ t: '00700.HK', n: '腾讯控股', m: 'HK' });
    expect(watchlistSecurityIdentity(security, 'en')).toMatchObject({ t: '00700.HK', n: 'Tencent Holdings', m: 'HK' });
  });
});
