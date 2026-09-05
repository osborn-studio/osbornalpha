export type WatchlistProviderMode = 'configured' | 'fallback' | 'unavailable';

export interface WatchlistProviderReadiness {
  id: 'search' | 'hk-financials' | 'structured-research' | 'official-documents' | 'trading-calendar';
  mode: WatchlistProviderMode;
  credentialConfigured: boolean;
}

type Environment = Record<string, string | undefined>;
const SEARCH_PROVIDER_KEYS = {
  tavily: 'TAVILY_API_KEY',
  brave: 'BRAVE_SEARCH_API_KEY',
  serper: 'SERPER_API_KEY',
} as const;

function configured(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function httpsEndpoint(value: string | undefined): boolean {
  if (!configured(value)) return false;
  try {
    return new URL(value!.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

function searchCredentialConfigured(environment: Environment): boolean {
  const explicit = environment.SEARCH_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    const key = SEARCH_PROVIDER_KEYS[explicit as keyof typeof SEARCH_PROVIDER_KEYS];
    return !!key && configured(environment[key]);
  }
  return Object.values(SEARCH_PROVIDER_KEYS).some((key) => configured(environment[key]));
}

export function watchlistProviderReadiness(environment: Environment = process.env): WatchlistProviderReadiness[] {
  const searchCredential = searchCredentialConfigured(environment);
  const hkFinancials = httpsEndpoint(environment.HK_FINANCIALS_API_URL);
  const structuredResearch = httpsEndpoint(environment.STRUCTURED_RESEARCH_API_URL);
  const officialDocuments = httpsEndpoint(environment.OFFICIAL_DOCUMENT_API_URL);
  const tradingCalendar = httpsEndpoint(environment.TRADING_CALENDAR_URL);
  return [
    { id: 'search', mode: searchCredential ? 'configured' : 'unavailable', credentialConfigured: searchCredential },
    { id: 'hk-financials', mode: hkFinancials ? 'configured' : 'unavailable', credentialConfigured: configured(environment.HK_FINANCIALS_API_TOKEN) },
    { id: 'structured-research', mode: structuredResearch ? 'configured' : 'fallback', credentialConfigured: configured(environment.STRUCTURED_RESEARCH_API_TOKEN) },
    { id: 'official-documents', mode: officialDocuments ? 'configured' : 'fallback', credentialConfigured: configured(environment.OFFICIAL_DOCUMENT_API_TOKEN) },
    { id: 'trading-calendar', mode: tradingCalendar ? 'configured' : 'fallback', credentialConfigured: configured(environment.TRADING_CALENDAR_API_KEY) },
  ];
}

export function requiredWatchlistProviders(environment: Environment = process.env): string[] {
  return [...new Set((environment.WATCHLIST_REQUIRED_PROVIDERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))];
}

export function missingRequiredWatchlistProviders(
  readiness: WatchlistProviderReadiness[],
  required: string[],
): string[] {
  const byId = new Map<string, WatchlistProviderReadiness>(readiness.map((item) => [item.id, item]));
  return required.filter((id) => byId.get(id)?.mode !== 'configured');
}
