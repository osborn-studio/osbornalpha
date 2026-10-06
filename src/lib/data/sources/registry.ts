/**
 * Market → quote-source registry. Replaces the hard-coded
 * eastmoney→sina→tencent cascade at each consumer with a single routing
 * table:
 *
 *   configured gateway → Datagateway/Wind is first for every market;
 *   A / HK / US       → Eastmoney, Sina, Tencent fallback chain
 *   TW                → TWSE fallback
 *   JP / KR           → EODHD fallback when configured
 */

import type { Market } from '@/lib/supabase/database.types';
import { fetchEastmoneyQuote } from './eastmoney';
import { fetchSinaQuote } from './sina';
import { fetchTencentQuote } from './tencent';
import { fetchTwseQuote } from './twse';
import { fetchEodhdQuote, isEodhdConfigured } from './eodhd';
import { fetchDatagatewayRealtimeQuote, isDatagatewayConfigured } from './datagateway-quote';

export interface NamedFetcher {
  name: string;
  fetch(ticker: string, signal?: AbortSignal): Promise<any | null>;
}

const eastmoney: NamedFetcher = { name: 'eastmoney', fetch: (t, signal) => fetchEastmoneyQuote(t, signal) };
const sina: NamedFetcher = { name: 'sina', fetch: (t, signal) => fetchSinaQuote(t, 4000, signal) };
const tencent: NamedFetcher = { name: 'tencent', fetch: (t, signal) => fetchTencentQuote(t, 4000, signal) };
const twse: NamedFetcher = { name: 'twse', fetch: (t, signal) => fetchTwseQuote(t, signal) };
const eodhd: NamedFetcher = { name: 'eodhd', fetch: (t) => fetchEodhdQuote(t) };
const datagatewayWind: NamedFetcher = { name: 'datagateway-wind', fetch: (t, signal) => fetchDatagatewayRealtimeQuote(t, { signal }) };

function primaryCascade(): NamedFetcher[] {
  return isDatagatewayConfigured()
    ? [datagatewayWind, eastmoney, sina, tencent]
    : [eastmoney, sina, tencent];
}

export function quoteSourcesFor(market: Market): NamedFetcher[] {
  switch (market) {
    case 'A':
    case 'HK':
    case 'US':
      return primaryCascade();
    case 'TW':
      return isDatagatewayConfigured() ? [datagatewayWind, twse] : [twse];
    case 'JP':
    case 'KR':
      return isDatagatewayConfigured()
        ? [datagatewayWind, ...(isEodhdConfigured() ? [eodhd] : [])]
        : (isEodhdConfigured() ? [eodhd] : []);
  }
}
