export const EVIDENCE_SCOPES = ['news', 'filing', 'broker', 'company', 'industry', 'macro'] as const;

export type EvidenceScope = typeof EVIDENCE_SCOPES[number];
export type EvidenceSourceType = EvidenceScope | 'social';
export type EvidenceSearchStatus = 'complete' | 'partial' | 'unavailable' | 'error';

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
}

export interface EvidenceSearchProvider {
  id: string;
  search(query: EvidenceQuery): Promise<RawEvidenceResult[]>;
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
}
