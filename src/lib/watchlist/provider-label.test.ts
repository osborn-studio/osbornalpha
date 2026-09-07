import { describe, expect, it } from 'vitest';
import { watchlistProviderLabel } from './provider-label';

const t = (key: string) => `translated:${key}`;

describe('Watchlist provider labels', () => {
  it('replaces internal and test adapter names with product labels', () => {
    expect(watchlistProviderLabel('test-feed', t)).toBe('translated:marketData');
    expect(watchlistProviderLabel('Test Research Wire', t)).toBe('translated:researchFeed');
    expect(watchlistProviderLabel('structured_research_http', t)).toBe('translated:researchFeed');
  });

  it('keeps recognizable provider brands and safe unknown names', () => {
    expect(watchlistProviderLabel('eastmoney', t)).toBe('Eastmoney');
    expect(watchlistProviderLabel('sec-company-facts', t)).toBe('SEC filings');
    expect(watchlistProviderLabel('Local exchange feed', t)).toBe('Local exchange feed');
    expect(watchlistProviderLabel(null, t)).toBe('--');
  });
});
