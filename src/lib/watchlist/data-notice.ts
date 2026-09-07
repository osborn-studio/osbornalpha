import type { WatchlistDataCapability, WatchlistDataFeature } from './data-capability';
import type { Market } from '@/lib/supabase/database.types';

export type WatchlistNoticeSeverity = 'warning' | 'critical';

export interface WatchlistDataNotice {
  id: string;
  kind: 'source' | 'capability';
  messageKey: string;
  severity: WatchlistNoticeSeverity;
  retryable: boolean;
  markets: Market[];
  features: WatchlistDataFeature[];
  lastSuccessAt: string | null;
}

const WARNING_KEYS: Record<string, string> = {
  watchlist_computed_overview_unavailable: 'computedOverview',
  watchlist_metric_snapshots_unavailable: 'metricSnapshots',
  watchlist_identities_unavailable: 'identities',
  watchlist_research_summaries_unavailable: 'research',
  watchlist_peer_metrics_unavailable: 'peerMetrics',
  watchlist_composition_unavailable: 'composition',
  watchlist_alert_summaries_unavailable: 'alerts',
  watchlist_provider_health_unavailable: 'providerHealth',
  watchlist_correlation_unavailable: 'correlation',
  watchlist_composition_stale: 'compositionStale',
  watchlist_composition_timestamp_unavailable: 'compositionTimestamp',
  stored_research_stale: 'researchStale',
  stored_research_expired: 'researchExpired',
};

export function watchlistWarningMessageKey(code: string): string {
  return WARNING_KEYS[code] ?? 'generic';
}

export function watchlistDataNotices(
  warnings: string[],
  capabilities: WatchlistDataCapability[],
): WatchlistDataNotice[] {
  const sourceNotices = [...new Set(warnings)].map((warning) => ({
    id: `source:${warning}`,
    kind: 'source' as const,
    messageKey: watchlistWarningMessageKey(warning),
    severity: 'warning' as const,
    retryable: true,
    markets: [],
    features: [],
    lastSuccessAt: null,
  }));
  const unhealthy = capabilities.filter((item) => item.runtime.status === 'degraded' || item.runtime.status === 'unavailable');
  const groups = new Map<string, typeof unhealthy>();
  for (const item of unhealthy) {
    const key = item.runtime.status;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const capabilityNotices = [...groups.entries()].map(([status, items]) => ({
    id: `capability:${status}`,
    kind: 'capability' as const,
    messageKey: status,
    severity: status === 'unavailable' ? 'critical' as const : 'warning' as const,
    retryable: true,
    markets: [...new Set(items.map((item) => item.market))],
    features: [...new Set(items.map((item) => item.feature))],
    lastSuccessAt: items.map((item) => item.runtime.lastSuccessAt)
      .filter((value): value is string => !!value).sort().at(-1) ?? null,
  }));
  return [...capabilityNotices, ...sourceNotices];
}
