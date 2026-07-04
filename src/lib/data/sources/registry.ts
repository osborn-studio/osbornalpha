/**
 * Market → quote-source registry. Replaces the hard-coded
 * eastmoney→sina→tencent cascade at each consumer with a single routing
 * table:
 *
 *   A / HK / US → [eastmoney, sina, tencent]  (unchanged order; A-share
 *                 tushare fallback stays at the /api/quote consumer layer)
 *   TW          → [twse]
 *   JP / KR     → [eodhd] when EODHD_API_TOKEN is configured, else []
 *                 (an empty list = "source pending" for the UI)
 */

import type { Market } from '@/lib/supabase/database.types';
import { fetchEastmoneyQuote } from './eastmoney';
import { fetchSinaQuote } from './sina';
import { fetchTencentQuote } from './tencent';
import { fetchTwseQuote } from './twse';
import { fetchEodhdQuote, isEodhdConfigured } from './eodhd';

export interface NamedFetcher {
  name: string;
  fetch(ticker: string): Promise<any | null>;
}

const eastmoney: NamedFetcher = { name: 'eastmoney', fetch: (t) => fetchEastmoneyQuote(t) };
const sina: NamedFetcher = { name: 'sina', fetch: (t) => fetchSinaQuote(t) };
const tencent: NamedFetcher = { name: 'tencent', fetch: (t) => fetchTencentQuote(t) };
const twse: NamedFetcher = { name: 'twse', fetch: (t) => fetchTwseQuote(t) };
const eodhd: NamedFetcher = { name: 'eodhd', fetch: (t) => fetchEodhdQuote(t) };

const CN_CASCADE: NamedFetcher[] = [eastmoney, sina, tencent];

export function quoteSourcesFor(market: Market): NamedFetcher[] {
  switch (market) {
    case 'A':
    case 'HK':
    case 'US':
      return CN_CASCADE;
    case 'TW':
      return [twse];
    case 'JP':
    case 'KR':
      return isEodhdConfigured() ? [eodhd] : [];
  }
}
