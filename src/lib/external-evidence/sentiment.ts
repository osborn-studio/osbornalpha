const POSITIVE = /\b(beat|beats|growth|upgrade|record|surge|raises guidance|approval|partnership|buyback)\b|增长|超预期|上调|创新高|获批|回购|合作/i;
const NEGATIVE = /\b(miss|misses|decline|downgrade|lawsuit|probe|recall|cuts guidance|layoff|fraud)\b|下滑|不及预期|下调|调查|诉讼|召回|裁员|造假/i;

const POSITIVE_TERMS = ['beat', 'beats', 'growth', 'upgrade', 'record', 'surge', 'raises guidance', 'approval', 'partnership', 'buyback', '增长', '超预期', '上调', '创新高', '获批', '回购', '合作'];
const NEGATIVE_TERMS = ['miss', 'misses', 'decline', 'downgrade', 'lawsuit', 'probe', 'recall', 'cuts guidance', 'layoff', 'fraud', '下滑', '不及预期', '下调', '调查', '诉讼', '召回', '裁员', '造假'];

export interface HeadlineSentimentAssessment {
  score: number | null;
  confidence: number;
  positiveMatches: string[];
  negativeMatches: string[];
}

function matches(text: string, terms: string[]): string[] {
  const normalized = text.toLocaleLowerCase();
  const found = terms.filter((term) => normalized.includes(term.toLocaleLowerCase()));
  // Avoid double-counting overlapping variants such as "beat" and "beats".
  return found.filter((term) => !found.some((other) => other.length > term.length && other.toLocaleLowerCase().includes(term.toLocaleLowerCase())));
}

export function assessHeadlineSentiment(text: string): HeadlineSentimentAssessment {
  const positiveMatches = matches(text, POSITIVE_TERMS);
  const negativeMatches = matches(text, NEGATIVE_TERMS);
  const score = positiveMatches.length === negativeMatches.length
    ? null
    : positiveMatches.length > negativeMatches.length ? 0.5 : -0.5;
  const evidenceCount = positiveMatches.length + negativeMatches.length;
  return {
    score,
    confidence: score == null ? 0 : Number(Math.min(1, 0.35 + evidenceCount * 0.2).toFixed(2)),
    positiveMatches,
    negativeMatches,
  };
}

export function classifyHeadlineSentiment(text: string): number | null {
  // Keep the legacy scalar API for stored rows and consumers that only need
  // direction; the detailed assessment is available to new surfaces.
  const positive = POSITIVE.test(text);
  const negative = NEGATIVE.test(text);
  if (positive === negative) return null;
  return positive ? 0.5 : -0.5;
}
