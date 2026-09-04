import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import {
  loadStoredStockResearch,
  persistStockNews,
  persistStockReports,
  type ResearchArtifactClient,
  type StoredStockResearch,
} from '@/lib/stocks/research-artifact-repository';
import { getStockNews, getStockReports } from '@/lib/stocks/external-research';
import type {
  BrokerConsensusView,
  StockNewsResponse,
  StockReportItem,
  StockReportsResponse,
  PerspectiveProvenance,
} from '@/lib/stocks/research-types';
import { deriveConsensus, filterConsensusReports, normalizeBrokerRating } from '@/lib/stocks/consensus';
import { watchlistTimestampFreshness } from './freshness';
import { EVIDENCE_QUALITY_FLAGS, type EvidenceQualityFlag } from '@/lib/external-evidence/types';

export interface WatchlistResearchBundle {
  ticker: string;
  news: StockNewsResponse;
  reports: StockReportsResponse;
  perspectives: PerspectiveRow[];
  perspectiveSource: string | null;
  perspectivesGeneratedAt: string | null;
  perspectiveProvenance: PerspectiveProvenance | null;
  refresh: {
    status: 'stored' | 'complete' | 'partial';
    refreshedAt: string | null;
    warnings: string[];
  };
}

export interface WatchlistResearchRefreshResult {
  status: 'complete' | 'partial';
  refreshedAt: string;
  newsUpdated: boolean;
  reportsUpdated: boolean;
  warnings: string[];
}

export interface WatchlistResearchSourceSnapshot {
  ticker: string;
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  status: 'complete' | 'partial';
  fetchedAt: string;
  warnings: string[];
}

export interface WatchlistResearchDependencies {
  getNews: typeof getStockNews;
  getReports: typeof getStockReports;
  persistNews: typeof persistStockNews;
  persistReports: typeof persistStockReports;
  now: () => Date;
}

const productionDependencies: WatchlistResearchDependencies = {
  getNews: getStockNews,
  getReports: getStockReports,
  persistNews: persistStockNews,
  persistReports: persistStockReports,
  now: () => new Date(),
};

function latest(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => !!value).sort().at(-1) ?? null;
}

function qualityFlags(value: string[] | null | undefined): EvidenceQualityFlag[] {
  return (value ?? []).filter((flag): flag is EvidenceQualityFlag => (
    EVIDENCE_QUALITY_FLAGS as readonly string[]
  ).includes(flag));
}

function storedMeta(
  fetchedAt: string | null,
  providers: string[],
  now: Date,
) {
  if (!fetchedAt) {
    return { status: 'unavailable' as const, providers, fetchedAt: now.toISOString(), warnings: ['stored_research_empty'] };
  }
  const freshness = watchlistTimestampFreshness(fetchedAt, now);
  return {
    status: freshness === 'fresh' ? 'complete' as const
      : freshness === 'stale' ? 'partial' as const
        : 'unavailable' as const,
    providers,
    fetchedAt,
    warnings: freshness === 'fresh' ? []
      : freshness === 'stale' ? ['stored_research_stale']
        : ['stored_research_expired'],
  };
}

function parseTargetRange(value: string | null): { min: number | null; max: number | null } {
  if (!value) return { min: null, max: null };
  const [rawMin, rawMax = rawMin] = value.split(':');
  const min = Number(rawMin);
  const max = Number(rawMax);
  return {
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
  };
}

function storedConsensus(items: StockReportItem[], now: Date): BrokerConsensusView | null {
  const filtered = filterConsensusReports(items.map((item) => ({
    max_price: item.targetPriceMax,
    min_price: item.targetPriceMin,
    report_date: item.publishedAt,
    org_name: item.broker,
    report_title: item.title,
  })), { asOf: now, maxAgeDays: 180 });
  const consensus = deriveConsensus(filtered.accepted);
  if (consensus == null) return null;
  return {
    targetMedian: consensus.target_median,
    targetMin: consensus.target_min,
    targetMax: consensus.target_max,
    count: consensus.n,
  };
}

export function mapStoredWatchlistResearch(
  ticker: string,
  stored: StoredStockResearch,
  now = new Date(),
): WatchlistResearchBundle {
  const newsFetchedAt = latest(stored.news.map((row) => row.fetched_at));
  const reportsFetchedAt = latest(stored.reports.map((row) => row.fetched_at));
  const newsProviders = [...new Set(stored.news.map((row) => row.source).filter((value): value is string => !!value))];
  const reportProviders = [...new Set(stored.reports.map((row) => row.source).filter((value): value is string => !!value))];
  const reportItems: StockReportItem[] = stored.reports.map((row) => {
    const target = parseTargetRange(row.target_price);
    return {
      id: row.source_key,
      title: row.title || `${ticker} research update`,
      broker: row.broker,
      rating: row.rating,
      ratingNormalized: normalizeBrokerRating(row.rating),
      targetPriceMin: target.min,
      targetPriceMax: target.max,
      targetChangePct: row.target_change_pct,
      url: row.pdf_url,
      publishedAt: row.published_at,
      source: row.source || 'stored',
      trustScore: row.trust_score ?? 0,
      relevanceScore: row.relevance_score ?? row.trust_score ?? 0,
      qualityScore: row.quality_score ?? row.trust_score ?? 0,
      qualityFlags: qualityFlags(row.quality_flags),
    };
  });
  const perspectives = stored.perspectives.map((row) => ({
    persona: row.persona,
    name: row.persona,
    stance: row.stance,
    confidence: row.confidence,
    summary: row.summary ?? '',
    cites: row.cites,
    citations: row.citations,
  }));
  const latestPerspective = stored.perspectives[0];
  const perspectiveProvenance: PerspectiveProvenance | null = latestPerspective
    ? {
        modelVersion: latestPerspective.model_version ?? null,
        promptVersion: latestPerspective.prompt_version ?? null,
        evidenceRequestId: latestPerspective.evidence_request_id ?? null,
        evidenceFetchedAt: latestPerspective.evidence_fetched_at ?? null,
        evidenceResultCount: Number.isSafeInteger(latestPerspective.evidence_result_count) && latestPerspective.evidence_result_count >= 0
          ? latestPerspective.evidence_result_count
          : 0,
        evidenceCoverageRatio: Number.isFinite(Number(latestPerspective.evidence_coverage_ratio))
          ? Math.max(0, Math.min(1, Number(latestPerspective.evidence_coverage_ratio)))
          : 0,
      }
    : null;
  return {
    ticker,
    news: {
      ticker,
      items: stored.news.map((row) => ({
        id: row.source_key,
        title: row.title,
        source: row.source || 'stored',
        url: row.url,
        snippet: row.snippet || '',
        sentiment: row.sentiment,
        publishedAt: row.published_at,
        fetchedAt: row.fetched_at,
        trustScore: row.trust_score ?? 0,
        relevanceScore: row.relevance_score ?? row.trust_score ?? 0,
        qualityScore: row.quality_score ?? row.trust_score ?? 0,
        qualityFlags: qualityFlags(row.quality_flags),
        sourceType: row.source_type || 'news',
      })),
      meta: storedMeta(newsFetchedAt, newsProviders, now),
    },
    reports: {
      ticker,
      items: reportItems,
      consensus: storedConsensus(reportItems, now),
      meta: storedMeta(reportsFetchedAt, reportProviders, now),
    },
    perspectives,
    perspectiveSource: stored.perspectives[0]?.source ?? null,
    perspectivesGeneratedAt: stored.perspectives[0]?.created_at ?? null,
    perspectiveProvenance,
    refresh: { status: 'stored', refreshedAt: latest([newsFetchedAt, reportsFetchedAt]), warnings: [] },
  };
}

export async function loadWatchlistResearchBundle(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
  now = new Date(),
): Promise<WatchlistResearchBundle> {
  return mapStoredWatchlistResearch(ticker, await loadStoredStockResearch(client, userId, ticker), now);
}

export async function refreshWatchlistResearch(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
  dependencies: WatchlistResearchDependencies = productionDependencies,
): Promise<WatchlistResearchRefreshResult> {
  const snapshot = await fetchWatchlistResearchSources(ticker, dependencies);
  return persistWatchlistResearchSnapshot(client, userId, snapshot, dependencies);
}

export async function fetchWatchlistResearchSources(
  ticker: string,
  dependencies: WatchlistResearchDependencies = productionDependencies,
): Promise<WatchlistResearchSourceSnapshot> {
  const [news, reports] = await Promise.allSettled([
    dependencies.getNews(ticker),
    dependencies.getReports(ticker),
  ]);
  if (news.status === 'rejected' && reports.status === 'rejected') {
    throw new Error('watchlist_research_refresh_failed');
  }
  return {
    ticker,
    news: news.status === 'fulfilled' ? news.value : null,
    reports: reports.status === 'fulfilled' ? reports.value : null,
    status: news.status === 'fulfilled' && reports.status === 'fulfilled' ? 'complete' : 'partial',
    fetchedAt: dependencies.now().toISOString(),
    warnings: [...new Set([
      ...(news.status === 'fulfilled' ? news.value.meta.warnings : ['news_refresh_failed']),
      ...(reports.status === 'fulfilled' ? reports.value.meta.warnings : ['reports_refresh_failed']),
    ])],
  };
}

export async function persistWatchlistResearchSnapshot(
  client: ResearchArtifactClient,
  userId: string,
  snapshot: WatchlistResearchSourceSnapshot,
  dependencies: WatchlistResearchDependencies = productionDependencies,
): Promise<WatchlistResearchRefreshResult> {
  const persisted = await Promise.allSettled([
    snapshot.news
      ? dependencies.persistNews(client, userId, snapshot.news)
      : Promise.reject(new Error('news_refresh_failed')),
    snapshot.reports
      ? dependencies.persistReports(client, userId, snapshot.reports)
      : Promise.reject(new Error('reports_refresh_failed')),
  ]);
  const newsUpdated = persisted[0].status === 'fulfilled';
  const reportsUpdated = persisted[1].status === 'fulfilled';
  if (!newsUpdated && !reportsUpdated) throw new Error('watchlist_research_refresh_failed');
  const warnings = [
    ...snapshot.warnings,
    ...(!newsUpdated && snapshot.news ? ['news_persist_failed'] : []),
    ...(!reportsUpdated && snapshot.reports ? ['reports_persist_failed'] : []),
  ];
  return {
    status: newsUpdated && reportsUpdated ? 'complete' : 'partial',
    refreshedAt: snapshot.fetchedAt,
    newsUpdated,
    reportsUpdated,
    warnings: [...new Set(warnings)],
  };
}
