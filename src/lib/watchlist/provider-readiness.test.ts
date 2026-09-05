import { describe, expect, it } from 'vitest';
import {
  missingRequiredWatchlistProviders,
  requiredWatchlistProviders,
  watchlistProviderReadiness,
} from './provider-readiness';

describe('Watchlist provider readiness', () => {
  it('reports honest fallback and unavailable modes without exposing values', () => {
    expect(watchlistProviderReadiness({})).toEqual([
      { id: 'search', mode: 'unavailable', credentialConfigured: false },
      { id: 'hk-financials', mode: 'unavailable', credentialConfigured: false },
      { id: 'structured-research', mode: 'fallback', credentialConfigured: false },
      { id: 'official-documents', mode: 'fallback', credentialConfigured: false },
      { id: 'trading-calendar', mode: 'fallback', credentialConfigured: false },
    ]);
  });

  it('accepts only HTTPS provider endpoints and resolves explicit requirements', () => {
    const environment = {
      TAVILY_API_KEY: 'secret',
      HK_FINANCIALS_API_URL: 'http://insecure.example/v1',
      STRUCTURED_RESEARCH_API_URL: 'https://research.example/v1',
      WATCHLIST_REQUIRED_PROVIDERS: 'search, structured-research, hk-financials,search',
    };
    const readiness = watchlistProviderReadiness(environment);
    const required = requiredWatchlistProviders(environment);
    expect(required).toEqual(['search', 'structured-research', 'hk-financials']);
    expect(missingRequiredWatchlistProviders(readiness, required)).toEqual(['hk-financials']);
  });

  it('fails readiness when the explicitly selected search provider lacks its own key', () => {
    const readiness = watchlistProviderReadiness({
      SEARCH_PROVIDER: 'brave',
      TAVILY_API_KEY: 'tavily-secret',
      WATCHLIST_REQUIRED_PROVIDERS: 'search',
    });
    expect(readiness.find((item) => item.id === 'search')).toEqual({
      id: 'search', mode: 'unavailable', credentialConfigured: false,
    });
    expect(missingRequiredWatchlistProviders(readiness, ['search'])).toEqual(['search']);
  });

  it('rejects an unknown explicit search provider even when another key exists', () => {
    expect(watchlistProviderReadiness({
      SEARCH_PROVIDER: 'unknown',
      TAVILY_API_KEY: 'tavily-secret',
    }).find((item) => item.id === 'search')?.mode).toBe('unavailable');
  });
});
