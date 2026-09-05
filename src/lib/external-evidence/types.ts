export const EVIDENCE_SCOPES = ['news', 'filing', 'broker', 'company', 'industry', 'macro'] as const;

export type EvidenceScope = typeof EVIDENCE_SCOPES[number];
export type EvidenceSourceType = EvidenceScope | 'social';
export type EvidenceSearchStatus = 'complete' | 'partial' | 'unavailable' | 'error';
export type EvidenceQualityFlag =
  | 'official_source'
  | 'professional_source'
  | 'provider_ranked'
  | 'dated_source'
  | 'snippet_available'
  | 'cross_source_corroborated'
  | 'unverified_source';
export const EVIDENCE_QUALITY_FLAGS: readonly EvidenceQualityFlag[] = [
  'official_source', 'professional_source', 'provider_ranked',
  'dated_source', 'snippet_available', 'cross_source_corroborated', 'unverified_source',
];

export interface EvidenceCorroboratingSource {
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  trustScore: number;
  qualityScore: number;
}

export interface EvidenceSearchRequest {
  query?: string;
  ticker?: string;
  name?: string;
  market?: string;
  scopes?: EvidenceScope[];
  freshnessDays?: number;
  limit?: number;
}

export interface NormalizedEvidenceSearchRequest {
  query?: string;
  ticker?: string;
  name?: string;
  market?: string;
  scopes: EvidenceScope[];
  freshnessDays: number;
  limit: number;
}

export interface EvidenceQuery {
  query: string;
  scope: EvidenceScope;
  freshnessDays: number;
  limit: number;
}

export interface RawEvidenceResult {
  title: string;
  url: string;
  snippet?: string | null;
  publishedAt?: string | null;
  score?: number | null;
}

export interface ExternalEvidence {
  citationId: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: EvidenceSourceType;
  publishedAt: string | null;
  fetchedAt: string;
  trustScore: number;
  relevanceScore: number;
  qualityScore: number;
  qualityFlags: EvidenceQualityFlag[];
  eventClusterId?: string;
  corroborationCount?: number;
  corroboratingSources?: EvidenceCorroboratingSource[];
  document?: EvidenceDocument;
}

export interface EvidenceDocumentParagraph {
  id: string;
  text: string;
  contentHash: string;
}

export interface EvidenceDocument {
  url: string;
  contentHash: string;
  fetchedAt: string;
  paragraphs: EvidenceDocumentParagraph[];
}

export interface EvidenceDocumentProvider {
  id: string;
  load(url: string): Promise<{ url: string; paragraphs: string[] }>;
}

export interface EvidenceSearchProvider {
  id: string;
  search(query: EvidenceQuery, signal?: AbortSignal): Promise<RawEvidenceResult[]>;
}

export interface EvidenceSearchSnapshot {
  requestId: string;
  status: EvidenceSearchStatus;
  provider: string | null;
  queryCount: number;
  results: ExternalEvidence[];
  fetchedAt: string;
  durationMs: number;
  estimatedCostMicrousd: number | null;
  warnings: string[];
}

export interface PerspectiveCitation {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  trustScore: number;
  qualityScore?: number;
  qualityFlags?: string[];
  corroborationCount?: number;
  paragraphId?: string;
  excerpt?: string;
  contentHash?: string;
}
