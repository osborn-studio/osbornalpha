import type { Market } from '@/lib/supabase/database.types';
import {
  watchlistProviderRuntimeStatus,
  type WatchlistProviderCircuitState,
  type WatchlistProviderHealthMap,
  type WatchlistProviderId,
} from './provider-health';

export const WATCHLIST_DATA_FEATURES = [
  'quote',
  'intradayChart',
  'historyChart',
  'totalReturn',
  'financials',
  'news',
  'reports',
] as const;

export type WatchlistDataFeature = typeof WATCHLIST_DATA_FEATURES[number];
export type WatchlistCapabilityStatus = 'ready' | 'degraded' | 'unavailable';

export interface WatchlistDataCapability {
  market: Market;
  feature: WatchlistDataFeature;
  status: WatchlistCapabilityStatus;
  providers: string[];
  reasonCode: string | null;
  runtime: {
    status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    latencyMs: number | null;
    circuitState: WatchlistProviderCircuitState | null;
  };
}

type Environment = Record<string, string | undefined>;

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

function gatewayConfigured(environment: Environment): boolean {
  return httpsEndpoint(environment.DATAGATEWAY_BASE_URL) && configured(environment.DATAGATEWAY_API_KEY);
}

function searchProvider(environment: Environment): string | null {
  const explicit = environment.SEARCH_PROVIDER?.trim().toLowerCase();
  const providers = [
    ['tavily', environment.TAVILY_API_KEY],
    ['brave', environment.BRAVE_SEARCH_API_KEY],
    ['serper', environment.SERPER_API_KEY],
    ['openai', environment.OPENAI_API_KEY],
  ] as const;
  if (explicit) return providers.find(([id, key]) => id === explicit && configured(key))?.[0] ?? null;
  return providers.find(([, key]) => configured(key))?.[0] ?? null;
}

function capability(
  market: Market,
  feature: WatchlistDataFeature,
  status: WatchlistCapabilityStatus,
  providers: string[],
  reasonCode: string | null = null,
): WatchlistDataCapability {
  return {
    market, feature, status, providers, reasonCode,
    runtime: {
      status: 'unknown', lastCheckedAt: null, lastSuccessAt: null, latencyMs: null, circuitState: null,
    },
  };
}

const PROVIDER_RUNTIME_IDS: Record<string, WatchlistProviderId | undefined> = {
  tavily: 'search',
  brave: 'search',
  serper: 'search',
  openai: 'search',
  'hk-financials-http': 'hk-financials',
  'structured-research-http': 'structured-research',
  'sec-company-facts': 'sec-companyfacts',
  'yahoo-chart': 'yahoo-chart',
};

function latestTimestamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => !!value).sort().at(-1) ?? null;
}

function withRuntimeHealth(
  item: WatchlistDataCapability,
  health: WatchlistProviderHealthMap,
  now: Date,
): WatchlistDataCapability {
  const runtimeRows = [...new Set(item.providers.flatMap((provider) => {
    const providerId = PROVIDER_RUNTIME_IDS[provider];
    return providerId && health[providerId] ? [health[providerId]!] : [];
  }))];
  if (runtimeRows.length === 0) return item;
  const statuses = runtimeRows.map((row) => watchlistProviderRuntimeStatus(row, now));
  const runtimeStatus = statuses.includes('healthy') ? 'healthy'
    : statuses.includes('degraded') ? 'degraded'
      : statuses.includes('unavailable') ? 'unavailable'
        : 'unknown';
  const monitoredProviderCount = item.providers.filter((provider) => !!PROVIDER_RUNTIME_IDS[provider]).length;
  const allConfiguredProvidersUnavailable = monitoredProviderCount === item.providers.length
    && statuses.every((status) => status === 'unavailable');
  const nextStatus = allConfiguredProvidersUnavailable
    ? 'unavailable'
    : runtimeStatus === 'degraded' || runtimeStatus === 'unavailable'
      ? item.status === 'ready' ? 'degraded' : item.status
      : item.status;
  return {
    ...item,
    status: nextStatus,
    reasonCode: allConfiguredProvidersUnavailable ? 'provider_circuit_open'
      : runtimeStatus === 'degraded' || runtimeStatus === 'unavailable'
        ? 'provider_runtime_degraded'
        : item.reasonCode,
    runtime: {
      status: runtimeStatus,
      lastCheckedAt: latestTimestamp(runtimeRows.map((row) => row.lastCheckedAt)),
      lastSuccessAt: latestTimestamp(runtimeRows.map((row) => row.lastSuccessAt)),
      latencyMs: runtimeRows.map((row) => row.latencyMs).filter((value): value is number => value !== null).sort((a, b) => b - a)[0] ?? null,
      circuitState: runtimeRows.some((row) => row.circuitState === 'open') ? 'open'
        : runtimeRows.some((row) => row.circuitState === 'half_open') ? 'half_open'
          : 'closed',
    },
  };
}

function quoteCapability(market: Market, environment: Environment): WatchlistDataCapability {
  const gateway = gatewayConfigured(environment);
  if (market === 'A' || market === 'HK' || market === 'US') {
    return capability(market, 'quote', 'ready', [
      ...(gateway ? ['datagateway-wind'] : []), 'eastmoney', 'sina', 'tencent',
    ]);
  }
  if (market === 'TW') {
    return capability(market, 'quote', 'ready', [...(gateway ? ['datagateway-wind'] : []), 'twse']);
  }
  const providers = [
    ...(gateway ? ['datagateway-wind'] : []),
    ...(configured(environment.EODHD_API_TOKEN) ? ['eodhd'] : []),
  ];
  return providers.length > 0
    ? capability(market, 'quote', 'degraded', providers, 'delayed_quote_only')
    : capability(market, 'quote', 'unavailable', [], 'quote_provider_unconfigured');
}

function intradayCapability(market: Market): WatchlistDataCapability {
  if (market === 'A' || market === 'HK' || market === 'US') {
    return capability(market, 'intradayChart', 'ready', ['eastmoney', 'sina']);
  }
  return capability(market, 'intradayChart', 'unavailable', [], 'intraday_market_unsupported');
}

function historyCapability(market: Market, environment: Environment): WatchlistDataCapability {
  const gateway = gatewayConfigured(environment);
  if (market === 'A' || market === 'HK' || market === 'US') {
    return capability(market, 'historyChart', 'ready', ['eastmoney', 'tencent', ...(gateway ? ['datagateway'] : [])]);
  }
  if (market === 'TW') return capability(market, 'historyChart', 'ready', ['twse', ...(gateway ? ['datagateway'] : [])]);
  return gateway
    ? capability(market, 'historyChart', 'ready', ['datagateway'])
    : capability(market, 'historyChart', 'unavailable', [], 'history_provider_unconfigured');
}

function financialCapability(market: Market, environment: Environment): WatchlistDataCapability {
  if (market === 'US') return capability(market, 'financials', 'ready', ['sec-company-facts']);
  if (market === 'A') return configured(environment.TUSHARE_TOKEN)
    ? capability(market, 'financials', 'ready', ['tushare'])
    : capability(market, 'financials', 'unavailable', [], 'tushare_unconfigured');
  if (market === 'HK') return httpsEndpoint(environment.HK_FINANCIALS_API_URL)
    ? capability(market, 'financials', 'ready', ['hk-financials-http'])
    : capability(market, 'financials', 'unavailable', [], 'hk_financials_provider_unconfigured');
  return capability(market, 'financials', 'unavailable', [], 'financials_market_unsupported');
}

function researchCapabilities(market: Market, environment: Environment): WatchlistDataCapability[] {
  const search = searchProvider(environment);
  const structured = (market === 'A' && configured(environment.TUSHARE_TOKEN))
    ? 'tushare'
    : ((market === 'US' || market === 'HK') && httpsEndpoint(environment.STRUCTURED_RESEARCH_API_URL))
      ? 'structured-research-http'
      : null;
  const news = search
    ? capability(market, 'news', 'ready', [search])
    : capability(market, 'news', 'unavailable', [], 'search_provider_unconfigured');
  const reportProviders = [...(structured ? [structured] : []), ...(search ? [search] : [])];
  const reports = structured
    ? capability(market, 'reports', search ? 'ready' : 'degraded', reportProviders, search ? null : 'search_provider_unconfigured')
    : search
      ? capability(market, 'reports', 'degraded', reportProviders, 'structured_research_provider_unconfigured')
      : capability(market, 'reports', 'unavailable', [], 'research_provider_unconfigured');
  return [news, reports];
}

export function watchlistDataCapabilities(
  markets: Market[],
  environment: Environment = process.env,
  providerHealth: WatchlistProviderHealthMap = {},
  now = new Date(),
): WatchlistDataCapability[] {
  return [...new Set(markets)].flatMap((market) => [
    quoteCapability(market, environment),
    intradayCapability(market),
    historyCapability(market, environment),
    capability(market, 'totalReturn', 'degraded', ['yahoo-chart'], 'public_provider_best_effort'),
    financialCapability(market, environment),
    ...researchCapabilities(market, environment),
  ]).map((item) => withRuntimeHealth(item, providerHealth, now));
}

export function watchlistCapabilityFor(
  capabilities: WatchlistDataCapability[],
  market: Market,
  feature: WatchlistDataFeature,
): WatchlistDataCapability | null {
  return capabilities.find((item) => item.market === market && item.feature === feature) ?? null;
}
