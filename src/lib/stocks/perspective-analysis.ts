import type { EvidenceSearchSnapshot, EvidenceSearchStatus } from '@/lib/external-evidence/types';

export const PERSPECTIVE_ANALYSIS_REQUEST_MODES = [
  'auto',
  'evidence_required',
  'structured_only',
] as const;

export type PerspectiveAnalysisRequestMode = typeof PERSPECTIVE_ANALYSIS_REQUEST_MODES[number];
export type PerspectiveAnalysisResolvedMode = 'evidence_backed' | 'structured_only';

export interface PerspectiveAnalysisResolution {
  requestedMode: PerspectiveAnalysisRequestMode;
  resolvedMode: PerspectiveAnalysisResolvedMode;
  evidenceRequired: boolean;
  evidenceStatus: EvidenceSearchStatus;
  evidenceAvailable: boolean;
  warnings: string[];
}

export function parsePerspectiveAnalysisMode(value: unknown): PerspectiveAnalysisRequestMode | null {
  return typeof value === 'string'
    && PERSPECTIVE_ANALYSIS_REQUEST_MODES.includes(value as PerspectiveAnalysisRequestMode)
    ? value as PerspectiveAnalysisRequestMode
    : null;
}

export function perspectiveAnalysisNeedsSearch(mode: PerspectiveAnalysisRequestMode): boolean {
  return mode !== 'structured_only';
}

export function resolvePerspectiveAnalysis(
  requestedMode: PerspectiveAnalysisRequestMode,
  evidence: Pick<EvidenceSearchSnapshot, 'status' | 'results' | 'warnings'>,
  extraWarnings: readonly string[] = [],
): PerspectiveAnalysisResolution {
  const evidenceAvailable = (evidence.status === 'complete' || evidence.status === 'partial')
    && evidence.results.length > 0;
  const resolvedMode = evidenceAvailable ? 'evidence_backed' : 'structured_only';
  return {
    requestedMode,
    resolvedMode,
    evidenceRequired: requestedMode === 'evidence_required',
    evidenceStatus: evidence.status,
    evidenceAvailable,
    warnings: [...new Set([...extraWarnings, ...evidence.warnings])],
  };
}

export function perspectiveAnalysisRequirementMet(resolution: PerspectiveAnalysisResolution): boolean {
  return !resolution.evidenceRequired || resolution.evidenceAvailable;
}
