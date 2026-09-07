import { normalizePerspectiveModelOutput, PerspectiveOutputError } from './perspective-output';
import type { PerspectiveEvalFixture } from './perspective-eval-fixtures';

export interface PerspectiveEvalResult {
  ok: boolean;
  total: number;
  passed: number;
  failed: Array<{ id: string; expected: string; actual: string }>;
  markets: string[];
}

export function evaluatePerspectiveFixtures(
  fixtures: readonly PerspectiveEvalFixture[],
): PerspectiveEvalResult {
  const failed: PerspectiveEvalResult['failed'] = [];
  for (const fixture of fixtures) {
    let actual = 'accepted';
    try {
      normalizePerspectiveModelOutput({
        value: fixture.output,
        persona: fixture.persona,
        evidence: fixture.evidence,
        analysisMode: fixture.analysisMode,
        allowedDataCites: fixture.allowedDataCites,
      });
    } catch (error) {
      actual = error instanceof PerspectiveOutputError ? error.code : 'unexpected_error';
    }
    if (actual !== fixture.expected) failed.push({
      id: fixture.id, expected: fixture.expected, actual,
    });
  }
  return {
    ok: failed.length === 0,
    total: fixtures.length,
    passed: fixtures.length - failed.length,
    failed,
    markets: [...new Set(fixtures.map((fixture) => fixture.market))].sort(),
  };
}
