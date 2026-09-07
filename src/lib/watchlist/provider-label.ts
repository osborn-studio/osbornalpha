export type WatchlistProviderLabelKey =
  | 'marketData'
  | 'researchFeed'
  | 'financialData'
  | 'savedResearch';

const PRODUCT_LABELS: Record<string, WatchlistProviderLabelKey> = {
  'test-feed': 'marketData',
  'mock': 'marketData',
  'demo': 'marketData',
  'test-research-wire': 'researchFeed',
  'structured-research-http': 'researchFeed',
  'hk-financials-http': 'financialData',
  'stored': 'savedResearch',
};

const BRAND_LABELS: Record<string, string> = {
  eastmoney: 'Eastmoney',
  sina: 'Sina Finance',
  tencent: 'Tencent Finance',
  tushare: 'Tushare',
  twse: 'TWSE',
  'yahoo-chart': 'Yahoo Finance',
  'sec-company-facts': 'SEC filings',
  tavily: 'Tavily Search',
  brave: 'Brave Search',
  serper: 'Google Search',
  openai: 'OpenAI Web Search',
  search: 'Web search',
};

function providerId(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_]+/g, '-');
}

export function watchlistProviderLabel(
  value: string | null | undefined,
  translate: (key: WatchlistProviderLabelKey) => string,
): string {
  const source = value?.trim();
  if (!source) return '--';
  const id = providerId(source);
  const productKey = PRODUCT_LABELS[id];
  if (productKey) return translate(productKey);
  return BRAND_LABELS[id] ?? source;
}
