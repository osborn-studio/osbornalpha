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
  language: 'en' | 'zh' | 'mixed' | 'unknown';
  aspects: Partial<Record<SentimentAspect, AspectSentimentAssessment>>;
}

export type SentimentAspect = 'earnings' | 'guidance' | 'legal' | 'capital' | 'operations' | 'market';

export interface AspectSentimentAssessment {
  score: number | null;
  confidence: number;
  matches: string[];
}

const TERM_ASPECTS: Partial<Record<string, SentimentAspect>> = {
  beat: 'earnings', beats: 'earnings', growth: 'earnings', record: 'earnings', miss: 'earnings', misses: 'earnings', decline: 'earnings',
  'raises guidance': 'guidance', 'cuts guidance': 'guidance',
  lawsuit: 'legal', probe: 'legal', fraud: 'legal', approval: 'legal',
  buyback: 'capital', upgrade: 'market', downgrade: 'market', surge: 'market',
  partnership: 'operations', recall: 'operations', layoff: 'operations',
  增长: 'earnings', 超预期: 'earnings', 下滑: 'earnings', 不及预期: 'earnings', 扭亏: 'earnings', 亏损: 'earnings', 预亏: 'earnings',
  上调: 'guidance', 下调: 'guidance', 获批: 'legal', 调查: 'legal', 诉讼: 'legal', 造假: 'legal', 处罚: 'legal',
  回购: 'capital', 增持: 'capital', 分红: 'capital', 减持: 'capital',
  合作: 'operations', 召回: 'operations', 裁员: 'operations', 中标: 'operations', 违约: 'operations', 创新高: 'market',
};

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

function languageOf(text: string): HeadlineSentimentAssessment['language'] {
  const chinese = /[\u3400-\u9fff]/.test(text);
  const english = /[a-z]/i.test(text);
  return chinese && english ? 'mixed' : chinese ? 'zh' : english ? 'en' : 'unknown';
}

function aspectAssessments(text: string, positive: TermMatch[], negative: TermMatch[]) {
  const grouped = new Map<SentimentAspect, { positive: string[]; negative: string[] }>();
  const add = (match: TermMatch, originallyPositive: boolean) => {
    const aspect = TERM_ASPECTS[match.term];
    if (!aspect) return;
    const group = grouped.get(aspect) ?? { positive: [], negative: [] };
    const negated = isNegated(text, match.index);
    const label = negated ? `not ${match.term}` : match.term;
    (originallyPositive !== negated ? group.positive : group.negative).push(label);
    grouped.set(aspect, group);
  };
  positive.forEach((match) => add(match, true));
  negative.forEach((match) => add(match, false));
  return Object.fromEntries([...grouped].map(([aspect, matches]) => {
    const count = matches.positive.length + matches.negative.length;
    return [aspect, {
      score: matches.positive.length === matches.negative.length ? null : matches.positive.length > matches.negative.length ? 0.5 : -0.5,
      confidence: matches.positive.length === matches.negative.length ? 0 : Number(Math.min(1, 0.35 + count * 0.2).toFixed(2)),
      matches: [...matches.positive, ...matches.negative],
    }];
  })) as HeadlineSentimentAssessment['aspects'];
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
    language: languageOf(text),
    aspects: aspectAssessments(text, positive, negative),
  };
}

export function classifyHeadlineSentiment(text: string): number | null {
  return assessHeadlineSentiment(text).score;
}
