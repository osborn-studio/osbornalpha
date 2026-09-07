import { describe, expect, it } from 'vitest';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import { buildWatchlistResearchDecisionBrief } from './research-decision-brief';

function perspective(overrides: Partial<PerspectiveRow>): PerspectiveRow {
  return {
    id: 'p', persona: 'fundamental', name: 'Fundamental', stance: 'neutral', confidence: 5,
    summary: '', cites: [], ...overrides,
  };
}

describe('buildWatchlistResearchDecisionBrief', () => {
  it('uses confidence-weighted stance and exposes material disagreement', () => {
    const brief = buildWatchlistResearchDecisionBrief([
      perspective({ id: 'bull', stance: 'bullish', confidence: 9 }),
      perspective({ id: 'bear', stance: 'bearish', confidence: 6 }),
      perspective({ id: 'neutral', stance: 'neutral', confidence: 4 }),
    ]);
    expect(brief).toMatchObject({
      stance: 'bullish',
      stanceCounts: { bullish: 1, neutral: 1, bearish: 1 },
      agreementRatio: 1 / 3,
      hasMaterialDisagreement: true,
    });
  });

  it('ranks and deduplicates catalyst and risk claims', () => {
    const brief = buildWatchlistResearchDecisionBrief([
      perspective({ confidence: 8, claims: [
        { kind: 'catalyst', text: 'New product', dataCites: [], citations: [] },
        { kind: 'risk', text: 'Margin pressure', dataCites: [], citations: [] },
      ] }),
      perspective({ confidence: 7, claims: [
        { kind: 'catalyst', text: 'New product', dataCites: [], citations: [] },
      ] }),
    ]);
    expect(brief.catalysts).toEqual(['New product']);
    expect(brief.risks).toEqual(['Margin pressure']);
  });

  it('aggregates historical outcomes and challenged claims', () => {
    const brief = buildWatchlistResearchDecisionBrief([
      perspective({
        outcomes: [
          { horizonDays: 30, returnPct: 5, directionCorrect: true, evaluatedAt: '2026-01-01' },
          { horizonDays: 90, returnPct: -2, directionCorrect: false, evaluatedAt: '2026-03-01' },
        ],
        claimFeedback: {
          a: { verdict: 'unsupported', reason: null },
          b: { verdict: 'helpful', reason: null },
        },
      }),
    ]);
    expect(brief).toMatchObject({ evaluatedOutcomes: 2, correctOutcomes: 1, historicalAccuracy: 0.5, challengedClaims: 1 });
  });
});
