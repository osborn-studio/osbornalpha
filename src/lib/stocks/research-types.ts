import type { EvidenceQualityFlag, EvidenceSearchStatus } from '@/lib/external-evidence/types';

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
