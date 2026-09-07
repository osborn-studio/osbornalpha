import type {
  EvidenceQualityFlag,
  EvidenceSearchSnapshot,
  EvidenceSourceType,
  ExternalEvidence,
} from './types';

export type EvidenceQualityIssue =
  | 'missing_publication_date'
  | 'missing_excerpt'
  | 'low_trust_source'
  | 'low_quality_source';

export interface EvidenceQualityCandidate {
  sourceType: EvidenceSourceType | string;
  publishedAt: string | null;
  trustScore: number;
  qualityScore: number;
  qualityFlags: readonly EvidenceQualityFlag[];
  excerpt: string;
}

export interface EvidenceQualityDecision {
  eligibleForAnalysis: boolean;
  issues: EvidenceQualityIssue[];
}

const TIME_SENSITIVE_SOURCES = new Set(['news', 'broker']);

function boundedScore(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Display can remain permissive, but model context must be inspectable and
 * sufficiently trustworthy. Official sources are allowed without an excerpt;
 * time-sensitive secondary sources also need a publication date.
 */
export function evaluateEvidenceQuality(
  candidate: EvidenceQualityCandidate,
): EvidenceQualityDecision {
  const flags = new Set(candidate.qualityFlags);
  const official = flags.has('official_source') || boundedScore(candidate.trustScore) >= 0.9;
  const professional = flags.has('professional_source') || boundedScore(candidate.trustScore) >= 0.75;
  const issues: EvidenceQualityIssue[] = [];

  if (boundedScore(candidate.trustScore) < 0.65) issues.push('low_trust_source');
  if (boundedScore(candidate.qualityScore) < 0.6) issues.push('low_quality_source');
  if (!candidate.excerpt.trim() && !official) issues.push('missing_excerpt');
  if (TIME_SENSITIVE_SOURCES.has(candidate.sourceType) && !candidate.publishedAt && !official) {
    issues.push('missing_publication_date');
  }

  return {
    eligibleForAnalysis: official || (professional && issues.length === 0),
    issues,
  };
}

export function evidenceQualityCandidate(item: ExternalEvidence): EvidenceQualityCandidate {
  return {
    sourceType: item.sourceType,
    publishedAt: item.publishedAt,
    trustScore: item.trustScore,
    qualityScore: item.qualityScore,
    qualityFlags: item.qualityFlags,
    excerpt: item.snippet,
  };
}

export function applyEvidenceQualityPolicy(snapshot: EvidenceSearchSnapshot): EvidenceSearchSnapshot {
  const accepted = snapshot.results.filter((item) => (
    evaluateEvidenceQuality(evidenceQualityCandidate(item)).eligibleForAnalysis
  ));
  const rejected = snapshot.results.length - accepted.length;
  if (rejected === 0) return snapshot;
  const warnings = [...new Set([...snapshot.warnings, `evidence_quality_filtered:${rejected}`])];
  return {
    ...snapshot,
    results: accepted,
    status: accepted.length === 0
      ? 'unavailable'
      : snapshot.status === 'complete' ? 'partial' : snapshot.status,
    warnings,
  };
}
