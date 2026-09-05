import { configuredOfficialDocumentProvider } from '@/lib/external-evidence/official-documents';
import { resolveEvidenceSearchProvider } from '@/lib/external-evidence/resolve-provider';
import { loadConfiguredHkFinancialReport } from '@/lib/financials/providers/hk-configured';
import { fetchExchangeCalendarSnapshot } from '@/lib/market/calendar-service';
import { loadConfiguredStructuredResearch } from '@/lib/stocks/structured-research-provider';
import {
  requiredWatchlistProviders,
  watchlistProviderReadiness,
  type WatchlistProviderReadiness,
} from './provider-readiness';
import type { RawEvidenceResult } from '@/lib/external-evidence/types';

type ProviderId = WatchlistProviderReadiness['id'];
type Environment = Record<string, string | undefined>;

export interface WatchlistProviderCanaryResult {
  id: ProviderId;
  mode: WatchlistProviderReadiness['mode'];
  status: 'passed' | 'failed' | 'skipped';
  latencyMs: number | null;
  errorCode?: string;
}

type Probe = () => Promise<void>;
type Probes = Partial<Record<ProviderId, Probe>>;

const DEFAULT_SEARCH_CANARY_QUERIES = [
  'AAPL Apple investor relations',
  '0700.HK Tencent investor relations',
  '600519.SH Kweichow Moutai investor relations',
] as const;

export function watchlistSearchCanaryQueries(environment: Environment): string[] {
  const configured = (environment.WATCHLIST_SEARCH_CANARY_QUERIES ?? '')
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  return configured.length > 0 ? configured : [...DEFAULT_SEARCH_CANARY_QUERIES];
}

function validSearchCanaryResults(results: RawEvidenceResult[]): boolean {
  return results.length > 0 && results.every((result) => {
    if (!result.title?.trim()) return false;
    try {
      const url = new URL(result.url);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  });
}

function stableErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : 'provider_canary_failed';
  return value.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 100) || 'provider_canary_failed';
}

function defaultProbes(environment: Environment, now: Date): Probes {
  return {
    search: async () => {
      const provider = resolveEvidenceSearchProvider(environment);
      if (!provider) throw new Error('search_provider_not_configured');
      for (const query of watchlistSearchCanaryQueries(environment)) {
        const results = await provider.search({ query, scope: 'company', freshnessDays: 365, limit: 1 });
        if (!Array.isArray(results) || !validSearchCanaryResults(results)) {
          throw new Error('search_provider_invalid_response');
        }
      }
    },
    'hk-financials': async () => {
      await loadConfiguredHkFinancialReport(environment.HK_FINANCIALS_CANARY_TICKER || '0700.HK');
    },
    'structured-research': async () => {
      const result = await loadConfiguredStructuredResearch(
        environment.STRUCTURED_RESEARCH_CANARY_TICKER || '0700.HK',
        'HK',
      );
      if (!result.configured) throw new Error('structured_research_provider_not_configured');
    },
    'official-documents': async () => {
      const provider = configuredOfficialDocumentProvider();
      const sourceUrl = environment.OFFICIAL_DOCUMENT_CANARY_URL?.trim();
      if (!provider) throw new Error('official_document_provider_not_configured');
      if (!sourceUrl) throw new Error('official_document_canary_url_required');
      await provider.load(sourceUrl);
    },
    'trading-calendar': async () => {
      const endpoint = environment.TRADING_CALENDAR_URL?.trim();
      if (!endpoint) throw new Error('trading_calendar_not_configured');
      const year = now.getUTCFullYear();
      await fetchExchangeCalendarSnapshot(endpoint, `${year}-01-01`, `${year}-12-31`, {
        apiKey: environment.TRADING_CALENDAR_API_KEY?.trim(),
      });
    },
  };
}

export async function runWatchlistProviderCanaries(
  options: { environment?: Environment; now?: Date } = {},
  injectedProbes?: Probes,
): Promise<WatchlistProviderCanaryResult[]> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? new Date();
  const required = new Set(requiredWatchlistProviders(environment));
  const probes = injectedProbes ?? defaultProbes(environment, now);

  return Promise.all(watchlistProviderReadiness(environment).map(async (provider) => {
    if (provider.mode !== 'configured') {
      return {
        id: provider.id,
        mode: provider.mode,
        status: required.has(provider.id) ? 'failed' as const : 'skipped' as const,
        latencyMs: null,
        ...(required.has(provider.id) ? { errorCode: 'required_provider_not_configured' } : {}),
      };
    }
    const probe = probes[provider.id];
    if (!probe) return { id: provider.id, mode: provider.mode, status: 'failed', latencyMs: null, errorCode: 'provider_probe_missing' };
    const startedAt = Date.now();
    try {
      await probe();
      return { id: provider.id, mode: provider.mode, status: 'passed', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        id: provider.id,
        mode: provider.mode,
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        errorCode: stableErrorCode(error),
      };
    }
  }));
}

export function providerCanariesPassed(results: WatchlistProviderCanaryResult[]): boolean {
  return results.every((result) => result.status !== 'failed');
}
