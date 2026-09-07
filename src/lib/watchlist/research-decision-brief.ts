import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { PerspectiveClaimKind } from '@/lib/stocks/perspective-claims';

export type ResearchDecisionStance = PerspectiveRow['stance'];

export interface WatchlistResearchDecisionBrief {
  stance: ResearchDecisionStance;
  stanceCounts: Record<ResearchDecisionStance, number>;
  averageConfidence: number | null;
  agreementRatio: number | null;
  hasMaterialDisagreement: boolean;
  catalysts: string[];
  risks: string[];
  evaluatedOutcomes: number;
  correctOutcomes: number;
  historicalAccuracy: number | null;
  challengedClaims: number;
}

function claimTexts(perspectives: PerspectiveRow[], kind: PerspectiveClaimKind): string[] {
  const ranked = perspectives.flatMap((perspective) => (perspective.claims ?? [])
    .filter((claim) => claim.kind === kind)
    .map((claim) => ({
      text: claim.text.trim(),
      score: perspective.confidence + claim.citations.length * 0.25 + claim.dataCites.length * 0.1,
    })))
    .filter((claim) => claim.text.length > 0)
    .sort((left, right) => right.score - left.score);
  const seen = new Set<string>();
  return ranked.flatMap(({ text }) => {
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  }).slice(0, 3);
}

export function buildWatchlistResearchDecisionBrief(
  perspectives: PerspectiveRow[],
): WatchlistResearchDecisionBrief {
  const stanceCounts = perspectives.reduce<Record<ResearchDecisionStance, number>>((counts, item) => {
    counts[item.stance] += 1;
    return counts;
  }, { bullish: 0, neutral: 0, bearish: 0 });
  const weightedScore = perspectives.reduce((sum, item) => {
    const direction = item.stance === 'bullish' ? 1 : item.stance === 'bearish' ? -1 : 0;
    return sum + direction * Math.max(0, item.confidence);
  }, 0);
  const stance: ResearchDecisionStance = weightedScore > 0 ? 'bullish'
    : weightedScore < 0 ? 'bearish'
      : 'neutral';
  const leadingCount = Math.max(stanceCounts.bullish, stanceCounts.neutral, stanceCounts.bearish);
  const agreementRatio = perspectives.length > 0 ? leadingCount / perspectives.length : null;
  const outcomes = perspectives.flatMap((item) => item.outcomes ?? []);
  const correctOutcomes = outcomes.filter((outcome) => outcome.directionCorrect).length;
  const challengedClaims = perspectives.reduce((total, item) => total + Object.values(item.claimFeedback ?? {})
    .filter((feedback) => feedback.verdict === 'incorrect' || feedback.verdict === 'unsupported').length, 0);

  return {
    stance,
    stanceCounts,
    averageConfidence: perspectives.length > 0
      ? perspectives.reduce((sum, item) => sum + item.confidence, 0) / perspectives.length
      : null,
    agreementRatio,
    hasMaterialDisagreement: stanceCounts.bullish > 0 && stanceCounts.bearish > 0
      || (agreementRatio !== null && agreementRatio < 0.6),
    catalysts: claimTexts(perspectives, 'catalyst'),
    risks: claimTexts(perspectives, 'risk'),
    evaluatedOutcomes: outcomes.length,
    correctOutcomes,
    historicalAccuracy: outcomes.length > 0 ? correctOutcomes / outcomes.length : null,
    challengedClaims,
  };
}
