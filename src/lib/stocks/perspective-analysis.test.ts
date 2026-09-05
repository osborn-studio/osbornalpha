import { describe, expect, it } from 'vitest';
import type { EvidenceSearchSnapshot } from '@/lib/external-evidence/types';
import {
  parsePerspectiveAnalysisMode,
  perspectiveAnalysisNeedsSearch,
  perspectiveAnalysisRequirementMet,
  resolvePerspectiveAnalysis,
} from './perspective-analysis';

const evidence = (
  patch: Partial<Pick<EvidenceSearchSnapshot, 'status' | 'results' | 'warnings'>> = {},
): Pick<EvidenceSearchSnapshot, 'status' | 'results' | 'warnings'> => ({
  status: 'complete' as const,
  results: [{
    citationId: 'web_1', title: 'Update', url: 'https://example.com', domain: 'example.com',
    snippet: 'Update', sourceType: 'news', publishedAt: null,
    fetchedAt: '2026-09-04T00:00:00Z', trustScore: 0.8, relevanceScore: 0.8,
    qualityScore: 0.8, qualityFlags: [],
  }],
  warnings: [],
  ...patch,
});

describe('perspective analysis mode', () => {
  it('accepts only the public request modes', () => {
    expect(parsePerspectiveAnalysisMode('auto')).toBe('auto');
    expect(parsePerspectiveAnalysisMode('evidence_required')).toBe('evidence_required');
    expect(parsePerspectiveAnalysisMode('structured_only')).toBe('structured_only');
    expect(parsePerspectiveAnalysisMode('evidence_backed')).toBeNull();
    expect(parsePerspectiveAnalysisMode(undefined)).toBeNull();
  });

  it('skips search only for an explicit structured-only request', () => {
    expect(perspectiveAnalysisNeedsSearch('structured_only')).toBe(false);
    expect(perspectiveAnalysisNeedsSearch('auto')).toBe(true);
    expect(perspectiveAnalysisNeedsSearch('evidence_required')).toBe(true);
  });

  it('resolves to evidence-backed only when usable results exist', () => {
    expect(resolvePerspectiveAnalysis('auto', evidence())).toMatchObject({
      resolvedMode: 'evidence_backed', evidenceAvailable: true, evidenceRequired: false,
    });
    expect(resolvePerspectiveAnalysis('auto', evidence({ results: [] }))).toMatchObject({
      resolvedMode: 'structured_only', evidenceAvailable: false,
    });
  });

  it('fails the requirement only when evidence was explicitly required', () => {
    const unavailable = evidence({ status: 'unavailable', results: [], warnings: ['provider_unavailable'] });
    expect(perspectiveAnalysisRequirementMet(resolvePerspectiveAnalysis('auto', unavailable))).toBe(true);
    expect(perspectiveAnalysisRequirementMet(resolvePerspectiveAnalysis('evidence_required', unavailable))).toBe(false);
  });
});
