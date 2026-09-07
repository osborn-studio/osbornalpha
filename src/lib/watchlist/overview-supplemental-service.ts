import type { StockUniverse, WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import { buildComputedWatchlistOverview } from './overview';
import { loadWatchlistMetricSnapshots } from './metric-snapshot-repository';
import { loadWatchlistResearchSummaries } from './research-repository';
import { loadWatchlistPeerMetrics } from './peer-metrics-repository';
import { loadWatchlistComposition } from './composition-repository';
import { loadWatchlistAlertSummaries } from './alert-summary-repository';
import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
import type { AppLocale } from '@/lib/i18n/locale';
import type { WatchlistServerClient } from './server-repository';
import type {
  DataEnvelope,
  WatchlistMarketSnapshot,
  WatchlistOverviewPageRow,
  WatchlistOverviewRow,
} from './overview-contract';
import type { HistoricalWatchlistMetrics } from './analytics';
import type { WatchlistResearchSummary } from './research-summary';
import { WATCHLIST_RESEARCH_WINDOW_DAYS } from './research-window';
import type { WatchlistPeerMetrics } from './peer-metrics';
import type { WatchlistComposition } from './composition';
import {
  EMPTY_WATCHLIST_ALERT_SUMMARY,
  unavailableWatchlistAlertSummaryEnvelope,
  watchlistAlertSummaryEnvelope,
  type WatchlistAlertSummary,
} from './alert-summary';
import { metricSnapshotEnvelope } from './metric-snapshot';
import { watchlistTimestampFreshness } from './freshness';
import { unavailableDataEnvelope } from './data-envelope';
import { requestErrorCode } from '@/lib/observability/request-run';
import { loadWatchlistProviderHealth } from './provider-health-repository';
import type { WatchlistProviderHealthMap } from './provider-health';

type ComputedOverview = Record<string, {
  market: DataEnvelope<WatchlistMarketSnapshot> | null;
  history: DataEnvelope<HistoricalWatchlistMetrics> | null;
}>;

export interface WatchlistOverviewSupplementalData {
  computed: ComputedOverview;
  metricSnapshots: Record<string, WatchlistMetricSnapshot>;
  identities: Record<string, StockUniverse>;
  researchByTicker: Record<string, WatchlistResearchSummary>;
  peerByTicker: Record<string, DataEnvelope<WatchlistPeerMetrics>>;
  composition: DataEnvelope<WatchlistComposition> | null;
  alertsByItem: Record<string, WatchlistAlertSummary>;
  providerHealth: WatchlistProviderHealthMap;
  warnings: string[];
}

const EMPTY_RESEARCH_SUMMARY: WatchlistResearchSummary = {
  recentNewsCount: 0,
  latestNewsAt: null,
  latestReportAt: null,
  averageSentiment: null,
  sentimentSampleSize: 0,
  sentimentCoverageRatio: 0,
  perspectiveCounts: { bullish: 0, neutral: 0, bearish: 0 },
  perspectiveDivergence: false,
  latestPerspectiveAt: null,
  researchWindowDays: WATCHLIST_RESEARCH_WINDOW_DAYS,
};

export interface WatchlistSupplementalSourceResult {
  source: string;
  status: 'complete' | 'unavailable';
  durationMs: number;
  errorCode: string | null;
}

interface LoadInput {
  client: WatchlistServerClient;
  tickers: string[];
  itemIds: string[];
  locale: AppLocale;
  historyRange: WatchlistHistoryRange;
  target?: { benchmark: string | null } | null;
  onSourceResult?: (result: WatchlistSupplementalSourceResult) => void;
}

interface LoadDependencies {
  computed: typeof buildComputedWatchlistOverview;
  metricSnapshots: typeof loadWatchlistMetricSnapshots;
  research: typeof loadWatchlistResearchSummaries;
  peer: typeof loadWatchlistPeerMetrics;
  composition: typeof loadWatchlistComposition;
  alerts: typeof loadWatchlistAlertSummaries;
  providerHealth: typeof loadWatchlistProviderHealth;
  identities: (client: WatchlistServerClient, tickers: string[]) => Promise<Record<string, StockUniverse>>;
}

const productionDependencies: LoadDependencies = {
  computed: buildComputedWatchlistOverview,
  metricSnapshots: loadWatchlistMetricSnapshots,
  research: loadWatchlistResearchSummaries,
  peer: loadWatchlistPeerMetrics,
  composition: loadWatchlistComposition,
  alerts: loadWatchlistAlertSummaries,
  providerHealth: loadWatchlistProviderHealth,
  identities: loadWatchlistIdentities,
};

async function loadWatchlistIdentities(
  client: WatchlistServerClient,
  tickers: string[],
): Promise<Record<string, StockUniverse>> {
  if (tickers.length === 0) return {};
  const db = client as unknown as {
    from(table: 'stocks_universe'): {
      select(columns: '*'): {
        in(column: 'ticker', values: string[]): Promise<{
          data: StockUniverse[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await db.from('stocks_universe').select('*').in('ticker', tickers);
  if (error) throw new Error(`watchlist_identity_load_failed:${error.message}`);
  return Object.fromEntries((data ?? []).map((identity) => [identity.ticker, identity]));
}

async function optionalSource<T>(
  warning: string,
  load: () => Promise<T>,
  fallback: T,
  observe?: (result: WatchlistSupplementalSourceResult) => void,
): Promise<{ value: T; warning: string | null }> {
  const startedAt = Date.now();
  try {
    const value = await load();
    observe?.({ source: warning, status: 'complete', durationMs: Date.now() - startedAt, errorCode: null });
    return { value, warning: null };
  } catch (error) {
    observe?.({
      source: warning,
      status: 'unavailable',
      durationMs: Date.now() - startedAt,
      errorCode: requestErrorCode(error, warning),
    });
    return { value: fallback, warning };
  }
}

export async function loadWatchlistOverviewSupplementalData(
  input: LoadInput,
  dependencies: LoadDependencies = productionDependencies,
): Promise<WatchlistOverviewSupplementalData> {
  const targeted = !!input.target;
  const [computed, metricSnapshots, identities, research, peer, composition, alerts, providerHealth] = await Promise.all([
    optionalSource(
      'watchlist_computed_overview_unavailable',
      () => targeted
        ? dependencies.computed(input.tickers, input.locale, {
            includeMarket: true,
            benchmarkTicker: input.target?.benchmark ?? null,
            historyRange: input.historyRange,
            includeTotalReturn: true,
          })
        : Promise.resolve({}),
      {} as ComputedOverview,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_metric_snapshots_unavailable',
      () => targeted ? Promise.resolve({}) : dependencies.metricSnapshots(input.client, input.tickers, input.historyRange),
      {} as Record<string, WatchlistMetricSnapshot>,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_identities_unavailable',
      () => dependencies.identities(input.client, input.tickers),
      {} as Record<string, StockUniverse>,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_research_summaries_unavailable',
      () => dependencies.research(input.client, input.tickers),
      {} as Record<string, WatchlistResearchSummary>,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_peer_metrics_unavailable',
      () => dependencies.peer(input.client, input.tickers, input.historyRange),
      {} as Record<string, DataEnvelope<WatchlistPeerMetrics>>,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_composition_unavailable',
      () => targeted ? Promise.resolve(null) : dependencies.composition(input.client, input.historyRange),
      null as DataEnvelope<WatchlistComposition> | null,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_alert_summaries_unavailable',
      () => dependencies.alerts(input.client, input.itemIds),
      {} as Record<string, WatchlistAlertSummary>,
      input.onSourceResult,
    ),
    optionalSource(
      'watchlist_provider_health_unavailable',
      () => dependencies.providerHealth(input.client),
      {} as WatchlistProviderHealthMap,
      input.onSourceResult,
    ),
  ]);

  return {
    computed: computed.value as ComputedOverview,
    metricSnapshots: metricSnapshots.value,
    identities: identities.value,
    researchByTicker: research.value,
    peerByTicker: peer.value,
    composition: composition.value,
    alertsByItem: alerts.value,
    providerHealth: providerHealth.value,
    warnings: [computed, metricSnapshots, identities, research, peer, composition, alerts, providerHealth]
      .flatMap((result) => result.warning ? [result.warning] : []),
  };
}

function researchEnvelope(summary: WatchlistResearchSummary): DataEnvelope<WatchlistResearchSummary> {
  const asOf = [summary.latestNewsAt, summary.latestReportAt, summary.latestPerspectiveAt]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;
  const status = watchlistTimestampFreshness(asOf);
  return {
    value: summary,
    asOf,
    source: 'stored-research',
    status,
    warnings: status === 'stale' ? ['stored_research_stale']
      : status === 'unavailable' ? ['stored_research_expired']
        : [],
  };
}

export function buildWatchlistOverviewRows(
  rows: WatchlistOverviewPageRow[],
  supplemental: WatchlistOverviewSupplementalData,
  targeted: boolean,
  generatedAt: string,
): WatchlistOverviewRow[] {
  const researchFailed = supplemental.warnings.includes('watchlist_research_summaries_unavailable');
  const peerFailed = supplemental.warnings.includes('watchlist_peer_metrics_unavailable');
  const alertsFailed = supplemental.warnings.includes('watchlist_alert_summaries_unavailable');

  return rows.map(({ group, item, querySnapshot }) => ({
    group: { id: group.id, name: group.name, sortOrder: group.sort_order },
    item,
    identity: supplemental.identities[item.ticker] ?? null,
    market: supplemental.computed[item.ticker]?.market ?? null,
    history: targeted
      ? supplemental.computed[item.ticker]?.history ?? unavailableDataEnvelope('computed-overview', 'watchlist_computed_overview_unavailable')
      : metricSnapshotEnvelope(supplemental.metricSnapshots[item.ticker] ?? null),
    peer: supplemental.peerByTicker[item.ticker]
      ?? (peerFailed ? unavailableDataEnvelope('shared-peer-snapshots', 'watchlist_peer_metrics_unavailable') : null),
    research: researchFailed
      ? unavailableDataEnvelope('stored-research', 'watchlist_research_summaries_unavailable')
      : researchEnvelope(supplemental.researchByTicker[item.ticker] ?? EMPTY_RESEARCH_SUMMARY),
    alerts: alertsFailed
      ? unavailableWatchlistAlertSummaryEnvelope()
      : watchlistAlertSummaryEnvelope(supplemental.alertsByItem[item.id] ?? EMPTY_WATCHLIST_ALERT_SUMMARY, generatedAt),
    querySnapshot: querySnapshot ?? null,
  }));
}
