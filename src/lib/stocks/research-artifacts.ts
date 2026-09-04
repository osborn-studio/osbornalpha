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

export function stockNewsRows(userId: string, response: StockNewsResponse) {
  return response.items.map((item) => ({
    id: stableUuid('stock-news', `${userId}:${response.ticker}:${item.id}`),
    user_id: userId,
    ticker: response.ticker,
    source_key: item.id,
    title: item.title,
    source: item.source,
    url: item.url,
    snippet: item.snippet,
    sentiment: item.sentiment,
    published_at: item.publishedAt,
    fetched_at: item.fetchedAt,
    trust_score: item.trustScore,
    relevance_score: item.relevanceScore ?? item.trustScore,
    quality_score: item.qualityScore ?? item.trustScore,
    quality_flags: item.qualityFlags ?? [],
    event_cluster_id: item.eventClusterId ?? item.id,
    corroboration_count: item.corroborationCount ?? 1,
    corroborating_sources: item.corroboratingSources ?? [],
    source_type: item.sourceType,
  }));
}

function reportTargetPrice(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}:${max}`;
  return String(min ?? max);
}

export function stockReportRows(userId: string, response: StockReportsResponse) {
  const fetchedAt = response.meta.fetchedAt;
  return response.items.map((item) => ({
    id: stableUuid('stock-report', `${userId}:${response.ticker}:${item.id}`),
    user_id: userId,
    ticker: response.ticker,
    source_key: item.id,
    title: item.title,
    broker: item.broker,
    rating: item.rating,
    target_price: reportTargetPrice(item.targetPriceMin, item.targetPriceMax),
    target_change_pct: item.targetChangePct,
    pdf_url: item.url,
    ai_summary: null,
    published_at: item.publishedAt?.slice(0, 10) ?? null,
    fetched_at: fetchedAt,
    source: item.source,
    trust_score: item.trustScore,
    relevance_score: item.relevanceScore ?? item.trustScore,
    quality_score: item.qualityScore ?? item.trustScore,
    quality_flags: item.qualityFlags ?? [],
    event_cluster_id: item.eventClusterId ?? item.id,
    corroboration_count: item.corroborationCount ?? 1,
    corroborating_sources: item.corroboratingSources ?? [],
  }));
}

export interface PerspectivePersistenceInput {
  ticker: string;
  generationId: string;
  source: string;
  createdAt: string;
  provenance?: PerspectiveProvenance;
  perspectives: PerspectiveResult[];
}

export function stockPerspectiveRows(userId: string, input: PerspectivePersistenceInput) {
  const provenance = input.provenance ?? {
    modelVersion: null,
    promptVersion: null,
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
    source: input.source,
    model_version: provenance.modelVersion,
    prompt_version: provenance.promptVersion,
    evidence_request_id: provenance.evidenceRequestId,
    evidence_fetched_at: provenance.evidenceFetchedAt,
    evidence_result_count: provenance.evidenceResultCount,
    evidence_coverage_ratio: provenance.evidenceCoverageRatio,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  }));
}
