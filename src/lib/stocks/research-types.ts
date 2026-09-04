import type { EvidenceQualityFlag, EvidenceSearchStatus } from '@/lib/external-evidence/types';
import type { BrokerRating } from './consensus';

export interface StockResearchMeta {
  status: EvidenceSearchStatus;
  providers: string[];
  fetchedAt: string;
  warnings: string[];
}

export interface StockNewsItem {
  id: string;
  title: string;
  source: string;
  url: string | null;
  snippet: string;
  sentiment: number | null;
  sentimentConfidence?: number;
  sentimentPositiveMatches?: string[];
  sentimentNegativeMatches?: string[];
  publishedAt: string | null;
  fetchedAt: string;
  trustScore: number;
  relevanceScore?: number;
  qualityScore?: number;
  qualityFlags?: EvidenceQualityFlag[];
  sourceType: string;
}

export interface StockReportItem {
  id: string;
  title: string;
  broker: string | null;
  rating: string | null;
  ratingNormalized?: BrokerRating;
  targetPriceMin: number | null;
  targetPriceMax: number | null;
  targetChangePct: number | null;
  url: string | null;
  publishedAt: string | null;
  source: string;
  trustScore: number;
  relevanceScore?: number;
  qualityScore?: number;
  qualityFlags?: EvidenceQualityFlag[];
}

export interface BrokerConsensusView {
  targetMedian: number;
  targetMin: number | null;
  targetMax: number | null;
  count: number;
}

export interface StockNewsResponse {
  ticker: string;
  items: StockNewsItem[];
  meta: StockResearchMeta;
}

export interface StockReportsResponse {
  ticker: string;
  items: StockReportItem[];
  consensus: BrokerConsensusView | null;
  meta: StockResearchMeta;
}

/** Immutable metadata describing how a set of AI perspectives was produced. */
export interface PerspectiveProvenance {
  modelVersion: string | null;
  promptVersion: string | null;
  evidenceRequestId: string | null;
  evidenceFetchedAt: string | null;
  evidenceResultCount: number;
  evidenceCoverageRatio: number;
}
