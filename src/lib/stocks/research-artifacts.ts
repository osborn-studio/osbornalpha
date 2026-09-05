import { createHash } from 'node:crypto';
import type { PerspectiveResult } from '@/lib/data/personas';
import type { StockNewsResponse, StockReportsResponse } from './research-types';
import type { PerspectiveProvenance } from './research-types';

function stableUuid(namespace: string, value: string): string {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const id = hex.join('');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export interface SharedResearchArtifactRow {
  id: string;
  kind: 'news' | 'report';
  ticker: string;
  source_key: string;
  title: string;
  source: string | null;
  url: string | null;
  published_at: string | null;
  fetched_at: string;
  event_cluster_id: string;
  quality_score: number;
  content_hash: string;
  payload: Record<string, unknown>;
}

function contentHash(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function stockNewsArtifactRows(response: StockNewsResponse): SharedResearchArtifactRow[] {
  return response.items.map((item) => {
    const payload = {
      snippet: item.snippet,
      sentiment: item.sentiment,
      sentiment_confidence: item.sentimentConfidence ?? 0,
      sentiment_language: item.sentimentLanguage ?? 'unknown',
      sentiment_aspects: item.sentimentAspects ?? {},
      trust_score: item.trustScore,
      relevance_score: item.relevanceScore ?? item.trustScore,
      quality_flags: item.qualityFlags ?? [],
      corroboration_count: item.corroborationCount ?? 1,
      corroborating_sources: item.corroboratingSources ?? [],
      source_type: item.sourceType,
    };
    return {
    id: stableUuid('stock-news', `${response.ticker}:${item.id}`),
    kind: 'news' as const,
    ticker: response.ticker,
    source_key: item.id,
    title: item.title,
    source: item.source,
    url: item.url,
    published_at: item.publishedAt,
    fetched_at: item.fetchedAt,
    quality_score: item.qualityScore ?? item.trustScore,
    event_cluster_id: item.eventClusterId ?? item.id,
    content_hash: contentHash(payload),
    payload,
  };
  });
}

function reportTargetPrice(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}:${max}`;
  return String(min ?? max);
}

export function stockReportArtifactRows(response: StockReportsResponse): SharedResearchArtifactRow[] {
  const fetchedAt = response.meta.fetchedAt;
  return response.items.map((item) => {
    const payload = {
      broker: item.broker,
      rating: item.rating,
      target_price: reportTargetPrice(item.targetPriceMin, item.targetPriceMax),
      target_change_pct: item.targetChangePct,
      ai_summary: null,
      trust_score: item.trustScore,
      relevance_score: item.relevanceScore ?? item.trustScore,
      quality_flags: item.qualityFlags ?? [],
      corroboration_count: item.corroborationCount ?? 1,
      corroborating_sources: item.corroboratingSources ?? [],
    };
    return {
    id: stableUuid('stock-report', `${response.ticker}:${item.id}`),
    kind: 'report' as const,
    ticker: response.ticker,
    source_key: item.id,
    title: item.title,
    url: item.url,
    published_at: item.publishedAt,
    fetched_at: fetchedAt,
    source: item.source,
    quality_score: item.qualityScore ?? item.trustScore,
    event_cluster_id: item.eventClusterId ?? item.id,
    content_hash: contentHash(payload),
    payload,
  };
  });
}

export interface PerspectivePersistenceInput {
  ticker: string;
  generationId: string;
  source: string;
  createdAt: string;
  provenance?: PerspectiveProvenance;
  referencePrice?: number | null;
  perspectives: PerspectiveResult[];
}

export function stockPerspectiveRows(userId: string, input: PerspectivePersistenceInput) {
  const provenance = input.provenance ?? {
    modelVersion: null,
    promptVersion: null,
    requestedAnalysisMode: 'auto',
    resolvedAnalysisMode: 'structured_only',
    evidenceStatus: 'unavailable',
    evidenceRequestId: null,
    evidenceFetchedAt: null,
    evidenceResultCount: 0,
    evidenceCoverageRatio: 0,
  } satisfies PerspectiveProvenance;
  return input.perspectives.map((item) => ({
    id: stableUuid('stock-perspective', `${userId}:${input.generationId}:${input.ticker}:${item.persona}`),
    brief_id: null,
    generation_id: input.generationId,
    user_id: userId,
    ticker: input.ticker,
    persona: item.persona,
    stance: item.stance,
    confidence: item.confidence,
    summary: item.summary,
    cites: item.cites,
    citations: item.citations ?? [],
    claims: item.claims ?? [],
    source: input.source,
    model_version: provenance.modelVersion,
    prompt_version: provenance.promptVersion,
    requested_analysis_mode: provenance.requestedAnalysisMode,
    resolved_analysis_mode: provenance.resolvedAnalysisMode,
    evidence_status: provenance.evidenceStatus,
    evidence_request_id: provenance.evidenceRequestId,
    evidence_fetched_at: provenance.evidenceFetchedAt,
    evidence_result_count: provenance.evidenceResultCount,
    evidence_coverage_ratio: provenance.evidenceCoverageRatio,
    reference_price: input.referencePrice != null && Number.isFinite(input.referencePrice) && input.referencePrice > 0
      ? input.referencePrice
      : null,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  }));
}
