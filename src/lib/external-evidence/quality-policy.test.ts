import { describe, expect, it } from 'vitest';
import type { EvidenceSearchSnapshot, ExternalEvidence } from './types';
import { applyEvidenceQualityPolicy, evaluateEvidenceQuality } from './quality-policy';

const source = (patch: Partial<ExternalEvidence> = {}): ExternalEvidence => ({
  citationId: 'web_1',
  title: 'Company reports quarterly results',
  url: 'https://reuters.com/example',
  domain: 'reuters.com',
  snippet: 'Revenue increased year over year.',
  sourceType: 'news',
  publishedAt: '2026-09-04T00:00:00.000Z',
  fetchedAt: '2026-09-05T00:00:00.000Z',
  trustScore: 0.78,
  relevanceScore: 0.8,
  qualityScore: 0.76,
  qualityFlags: ['professional_source', 'dated_source', 'snippet_available'],
  ...patch,
});

describe('external evidence quality policy', () => {
  it('accepts inspectable professional sources and official primary sources', () => {
    expect(evaluateEvidenceQuality({
      sourceType: 'news', publishedAt: source().publishedAt, trustScore: 0.78,
      qualityScore: 0.76, qualityFlags: source().qualityFlags, excerpt: source().snippet,
    }).eligibleForAnalysis).toBe(true);
    expect(evaluateEvidenceQuality({
      sourceType: 'filing', publishedAt: null, trustScore: 0.95, qualityScore: 0.8,
      qualityFlags: ['official_source'], excerpt: '',
    }).eligibleForAnalysis).toBe(true);
  });

  it('keeps weak material out of model context with explicit reasons', () => {
    expect(evaluateEvidenceQuality({
      sourceType: 'news', publishedAt: null, trustScore: 0.55, qualityScore: 0.5,
      qualityFlags: ['unverified_source'], excerpt: '',
    })).toEqual({
      eligibleForAnalysis: false,
      issues: ['low_trust_source', 'low_quality_source', 'missing_excerpt', 'missing_publication_date'],
    });
  });

  it('degrades a snapshot after filtering instead of hiding the quality loss', () => {
    const snapshot: EvidenceSearchSnapshot = {
      requestId: 'request-1', status: 'complete', provider: 'mixed', queryCount: 2,
      results: [source(), source({ citationId: 'web_2', url: 'https://blog.example/item', domain: 'blog.example',
        trustScore: 0.55, qualityScore: 0.5, qualityFlags: ['unverified_source'], publishedAt: null, snippet: '' })],
      fetchedAt: '2026-09-05T00:00:00.000Z', durationMs: 20, estimatedCostMicrousd: null, warnings: [],
    };
    expect(applyEvidenceQualityPolicy(snapshot)).toMatchObject({
      status: 'partial', results: [{ citationId: 'web_1' }], warnings: ['evidence_quality_filtered:1'],
    });
  });
});
