import { createHash } from 'node:crypto';
import { evaluateEvidenceQuality, type EvidenceQualityIssue } from '@/lib/external-evidence/quality-policy';
import type { EvidenceQualityFlag } from '@/lib/external-evidence/types';
import type { StockNewsItem, StockReportItem } from '@/lib/stocks/research-types';

export type WatchlistResearchSourceKind = 'news' | 'filing' | 'report';
export type WatchlistResearchFactKind = 'market_event' | 'filing' | 'broker_view';
export type WatchlistResearchDirection = 'positive' | 'neutral' | 'negative' | 'unknown';

export interface WatchlistResearchSource {
  id: string;
  kind: WatchlistResearchSourceKind;
  title: string;
  publisher: string;
  url: string | null;
  publishedAt: string | null;
  fetchedAt: string | null;
  trustScore: number;
  qualityScore: number;
  qualityFlags: EvidenceQualityFlag[];
  corroborationCount: number;
  eligibleForAnalysis: boolean;
  qualityIssues: EvidenceQualityIssue[];
}

export interface WatchlistResearchFact {
  id: string;
  kind: WatchlistResearchFactKind;
  statement: string;
  direction: WatchlistResearchDirection;
  confidence: number;
  observedAt: string | null;
  sourceIds: string[];
  sourceCount: number;
  conflicted: boolean;
  metrics: Record<string, number>;
}

export interface WatchlistResearchQualitySummary {
  totalSources: number;
  eligibleSources: number;
  datedSources: number;
  corroboratedSources: number;
  conflictedFacts: number;
  averageQualityScore: number | null;
  warnings: string[];
}

export interface WatchlistResearchEvidenceProjection {
  facts: WatchlistResearchFact[];
  sources: WatchlistResearchSource[];
  quality: WatchlistResearchQualitySummary;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

function boundedScore(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, Number(value))) : 0;
}

function newsDirection(value: number | null): WatchlistResearchDirection {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value > 0.1) return 'positive';
  if (value < -0.1) return 'negative';
  return 'neutral';
}

function reportDirection(value: StockReportItem['ratingNormalized']): WatchlistResearchDirection {
  if (value === 'buy') return 'positive';
  if (value === 'sell') return 'negative';
  if (value === 'hold') return 'neutral';
  return 'unknown';
}

function sourceQuality(input: {
  sourceType: string;
  publishedAt: string | null;
  trustScore: number;
  qualityScore?: number;
  qualityFlags?: EvidenceQualityFlag[];
  excerpt: string;
}) {
  const qualityScore = boundedScore(input.qualityScore ?? input.trustScore);
  const qualityFlags = input.qualityFlags ?? [];
  const decision = evaluateEvidenceQuality({
    sourceType: input.sourceType,
    publishedAt: input.publishedAt,
    trustScore: boundedScore(input.trustScore),
    qualityScore,
    qualityFlags,
    excerpt: input.excerpt,
  });
  return { qualityScore, qualityFlags, decision };
}

function newsSource(item: StockNewsItem): WatchlistResearchSource {
  const kind: WatchlistResearchSourceKind = item.sourceType === 'filing' ? 'filing' : 'news';
  const quality = sourceQuality({
    sourceType: kind,
    publishedAt: item.publishedAt,
    trustScore: item.trustScore,
    qualityScore: item.qualityScore,
    qualityFlags: item.qualityFlags,
    excerpt: item.snippet,
  });
  return {
    id: `source:news:${item.id}`,
    kind,
    title: item.title,
    publisher: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    trustScore: boundedScore(item.trustScore),
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags,
    corroborationCount: Math.max(1, item.corroborationCount ?? 1),
    eligibleForAnalysis: quality.decision.eligibleForAnalysis,
    qualityIssues: quality.decision.issues,
  };
}

function reportSource(item: StockReportItem): WatchlistResearchSource {
  const quality = sourceQuality({
    sourceType: 'broker',
    publishedAt: item.publishedAt,
    trustScore: item.trustScore,
    qualityScore: item.qualityScore,
    qualityFlags: item.qualityFlags,
    excerpt: [item.rating, item.targetPriceMin, item.targetPriceMax].filter((value) => value != null).join(' '),
  });
  return {
    id: `source:report:${item.id}`,
    kind: 'report',
    title: item.title,
    publisher: item.broker ?? item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    fetchedAt: null,
    trustScore: boundedScore(item.trustScore),
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags,
    corroborationCount: Math.max(1, item.corroborationCount ?? 1),
    eligibleForAnalysis: quality.decision.eligibleForAnalysis,
    qualityIssues: quality.decision.issues,
  };
}

export function buildWatchlistResearchEvidence(
  news: StockNewsItem[],
  reports: StockReportItem[],
): WatchlistResearchEvidenceProjection {
  const sources = [...news.map(newsSource), ...reports.map(reportSource)];
  const candidates = [
    ...news.map((item) => {
      const sourceId = `source:news:${item.id}`;
      const metrics: Record<string, number> = {};
      if (item.sentiment != null) metrics.sentiment = item.sentiment;
      return {
        clusterKey: `${item.sourceType === 'filing' ? 'filing' : 'market_event'}:${item.eventClusterId ?? sourceId}`,
        fact: {
          id: stableId('fact', sourceId),
          kind: item.sourceType === 'filing' ? 'filing' as const : 'market_event' as const,
          statement: item.title,
          direction: newsDirection(item.sentiment),
          confidence: boundedScore((item.qualityScore ?? item.trustScore) * (item.sentimentConfidence ?? 1)),
          observedAt: item.publishedAt ?? item.fetchedAt,
          sourceIds: [sourceId],
          sourceCount: 1,
          conflicted: false,
          metrics,
        },
      };
    }),
    ...reports.map((item) => {
      const sourceId = `source:report:${item.id}`;
      const metrics: Record<string, number> = {};
      if (item.targetPriceMin != null) metrics.targetPriceMin = item.targetPriceMin;
      if (item.targetPriceMax != null) metrics.targetPriceMax = item.targetPriceMax;
      if (item.targetChangePct != null) metrics.targetChangePct = item.targetChangePct;
      return {
        clusterKey: `broker_view:${item.eventClusterId ?? sourceId}`,
        fact: {
          id: stableId('fact', sourceId),
          kind: 'broker_view' as const,
          statement: item.title,
          direction: reportDirection(item.ratingNormalized),
          confidence: boundedScore(item.qualityScore ?? item.trustScore),
          observedAt: item.publishedAt,
          sourceIds: [sourceId],
          sourceCount: 1,
          conflicted: false,
          metrics,
        },
      };
    }),
  ];
  const clusters = new Map<string, WatchlistResearchFact[]>();
  const eligibleSourceIds = new Set(sources.filter((source) => source.eligibleForAnalysis).map((source) => source.id));
  for (const candidate of candidates) {
    if (!candidate.fact.sourceIds.some((sourceId) => eligibleSourceIds.has(sourceId))) continue;
    clusters.set(candidate.clusterKey, [...(clusters.get(candidate.clusterKey) ?? []), candidate.fact]);
  }
  const facts = [...clusters.entries()].map(([clusterKey, cluster]) => {
    const representative = [...cluster].sort((left, right) => right.confidence - left.confidence)[0];
    const directions = new Set(cluster.map((fact) => fact.direction));
    const conflicted = directions.has('positive') && directions.has('negative');
    const knownDirection = cluster.find((fact) => fact.direction !== 'unknown')?.direction ?? 'unknown';
    const observedAt = cluster.map((fact) => fact.observedAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;
    return {
      ...representative,
      id: stableId('fact', clusterKey),
      direction: conflicted ? 'unknown' as const : knownDirection,
      confidence: Number((cluster.reduce((sum, fact) => sum + fact.confidence, 0) / cluster.length).toFixed(3)),
      observedAt,
      sourceIds: [...new Set(cluster.flatMap((fact) => fact.sourceIds))],
      sourceCount: cluster.length,
      conflicted,
    };
  }).sort((left, right) => (right.observedAt ?? '').localeCompare(left.observedAt ?? ''));
  const qualityTotal = sources.reduce((sum, item) => sum + item.qualityScore, 0);
  const eligibleSources = sources.filter((item) => item.eligibleForAnalysis).length;
  const conflictedFacts = facts.filter((fact) => fact.conflicted).length;
  const warnings = [
    ...(eligibleSources < sources.length ? ['research_sources_quality_filtered'] : []),
    ...(conflictedFacts > 0 ? ['research_fact_conflicts'] : []),
  ];
  return {
    facts,
    sources,
    quality: {
      totalSources: sources.length,
      eligibleSources,
      datedSources: sources.filter((item) => item.publishedAt !== null).length,
      corroboratedSources: sources.filter((item) => item.corroborationCount > 1).length,
      conflictedFacts,
      averageQualityScore: sources.length > 0 ? Number((qualityTotal / sources.length).toFixed(3)) : null,
      warnings,
    },
  };
}
