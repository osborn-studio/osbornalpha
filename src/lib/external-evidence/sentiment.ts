const POSITIVE_TERMS = [
  'beat', 'beats', 'growth', 'upgrade', 'record', 'surge', 'raises guidance', 'approval',
  'partnership', 'buyback', '增长', '超预期', '上调', '创新高', '获批', '回购', '合作',
  '扭亏', '增持', '分红', '中标',
];
const NEGATIVE_TERMS = [
  'miss', 'misses', 'decline', 'downgrade', 'lawsuit', 'probe', 'recall', 'cuts guidance',
  'layoff', 'fraud', '下滑', '不及预期', '下调', '调查', '诉讼', '召回', '裁员', '造假',
  '亏损', '预亏', '减持', '违约', '处罚',
];

export interface HeadlineSentimentAssessment {
  score: number | null;
  confidence: number;
  positiveMatches: string[];
  negativeMatches: string[];
}

interface TermMatch {
  term: string;
  index: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTerm(text: string, term: string): TermMatch | null {
  const normalized = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  if (/^[a-z0-9 ]+$/i.test(needle)) {
    const match = new RegExp(`\\b${escapeRegExp(needle).replace(/ /g, '\\s+')}\\b`, 'i').exec(normalized);
    return match ? { term, index: match.index } : null;
  }
  const index = normalized.indexOf(needle);
  return index >= 0 ? { term, index } : null;
}

function removeOverlaps(matches: TermMatch[]): TermMatch[] {
  return matches.filter((match) => !matches.some((other) => (
    other !== match
    && other.index <= match.index
    && other.index + other.term.length >= match.index + match.term.length
    && other.term.length > match.term.length
  )));
}

function isNegated(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 36), index).toLocaleLowerCase();
  const english = /\b(no|not|never|without|denies?|denied|fails?\s+to)\b(?:\W+\w+){0,3}\W*$/i.test(prefix);
  const chinese = /(未|不|无|否认|并非)[^，。；！？,.!?;]{0,6}$/.test(prefix);
  return english || chinese;
}

function polarityMatches(text: string, terms: string[]) {
  return removeOverlaps(terms.flatMap((term) => {
    const match = findTerm(text, term);
    return match ? [match] : [];
  }));
}

export function assessHeadlineSentiment(text: string): HeadlineSentimentAssessment {
  const positive = polarityMatches(text, POSITIVE_TERMS);
  const negative = polarityMatches(text, NEGATIVE_TERMS);
  const positiveMatches = [
    ...positive.filter((match) => !isNegated(text, match.index)).map((match) => match.term),
    ...negative.filter((match) => isNegated(text, match.index)).map((match) => `not ${match.term}`),
  ];
  const negativeMatches = [
    ...negative.filter((match) => !isNegated(text, match.index)).map((match) => match.term),
    ...positive.filter((match) => isNegated(text, match.index)).map((match) => `not ${match.term}`),
  ];
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
  return assessHeadlineSentiment(text).score;
}
