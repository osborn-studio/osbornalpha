/**
 * WP-A6 question set v1.0 (implementation plan 2026-09-22 §6.1).
 * Option keys are stable identifiers shared by every backend and by the
 * ledger; Chinese wording is prompt material only. Thresholds are the
 * pre-calibration starting values; changing any of them is a version bump.
 */
import { fail } from '../ingest/pa-v1/json.js';

export const QUESTION_SET_VERSION = 'v1.0';
export const QUESTION_IDS = ['Q1','Q2','Q3','Q4','Q5'] as const;
export type QuestionId = typeof QUESTION_IDS[number];

export interface QuestionDef {
  type: 'noul' | 'choice';
  instructions: string;
  options: readonly string[];
  /** Human-readable meaning per option, used as Jev `criteria` and in the DeepSeek prompt. */
  criteria: Record<string, string>;
  /** Asked once per material, not per thesis. */
  material_level?: boolean;
}

export const QUESTIONS: Record<QuestionId, QuestionDef> = {
  Q1: { type: 'noul', options: ['true','false'],
    instructions: '这份材料是否涉及该 thesis 的任一支柱、观察指标或失效条件？',
    criteria: { true: '材料内容与该 thesis 的支柱、观察指标或失效条件直接相关', false: '材料与该 thesis 无关' } },
  Q2: { type: 'choice', options: ['support','weaken','trigger_invalidation','related_insufficient'],
    instructions: '材料对该 thesis 的作用是什么？',
    criteria: { support: '材料支持该 thesis 的支柱', weaken: '材料削弱该 thesis 的支柱', trigger_invalidation: '材料满足该 thesis 的某条失效条件',
      related_insufficient: '材料相关，但证据不足以支持或削弱' } },
  Q3: { type: 'choice', material_level: true, options: ['filing_or_regulator','executive_statement','third_party_data','analyst_or_media','retelling','unknown'],
    instructions: '这份材料的信息来源类型是什么？',
    criteria: { filing_or_regulator: '公司公告或监管文件', executive_statement: '公司高管的公开表述', third_party_data: '独立第三方数据',
      analyst_or_media: '分析师或媒体观点', retelling: '转述他人报道', unknown: '无法判断' } },
  Q4: { type: 'choice', options: ['completed','planned','denied','conditional','not_applicable'],
    instructions: '材料中与该 thesis 相关的关键主张处于什么状态？',
    criteria: { completed: '已完成或已发生', planned: '计划、拟议或预期', denied: '被否认或被否决', conditional: '有条件或取决于其他事件', not_applicable: '不适用' } },
  Q5: { type: 'noul', options: ['true','false'],
    instructions: '相对同一簇内最早的材料，这份材料是否包含新增事实？',
    criteria: { true: '包含簇内最早材料没有的新事实', false: '只是转述或重复' } },
};

/** Starting thresholds (§6.1). */
export const THRESHOLDS = {
  Q1: { irrelevant_below: 0.4, relevant_above: 0.6 },
  Q2: { min_confidence: 0.6 },
  Q3: { min_confidence: 0.5, fallback: 'unknown' },
  Q4: { min_confidence: 0.5, fallback: 'not_applicable' },
  Q5: { retelling_below: 0.5 },
} as const;

export interface Decision { selected: string | null; abstained: boolean; confidence: number | null }

const isProb = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Jev's documented confidence for a choice: (n·max_p − 1)/(n − 1) over the question's n options. */
export function choiceConfidence(question: QuestionId, distribution: Record<string, number>): number {
  const n = QUESTIONS[question].options.length;
  const max = Math.max(0, ...Object.values(distribution));
  return Math.max(0, Math.min(1, (n * max - 1) / (n - 1)));
}

/**
 * Apply the abstention band / fallback of one question to a distribution.
 * Unknown option keys are a contract violation; an empty distribution is an abstention.
 */
export function decide(question: QuestionId, distribution: Record<string, number>, confidence: number | null): Decision {
  const def = QUESTIONS[question];
  if (!def) fail('invalid_schema');
  const keys = Object.keys(distribution ?? {});
  if (!keys.every(k => def.options.includes(k)) || !Object.values(distribution ?? {}).every(isProb)) fail('invalid_schema');
  if (confidence != null && !isProb(confidence)) fail('invalid_schema');
  if (keys.length === 0) return { selected: null, abstained: true, confidence: null };
  if (def.type === 'noul') {
    const p = distribution.true ?? (distribution.false != null ? 1 - distribution.false : 0);
    if (question === 'Q1') {
      if (p > THRESHOLDS.Q1.relevant_above) return { selected: 'true', abstained: false, confidence: null };
      if (p < THRESHOLDS.Q1.irrelevant_below) return { selected: 'false', abstained: false, confidence: null };
      return { selected: null, abstained: true, confidence: null };
    }
    return { selected: p >= THRESHOLDS.Q5.retelling_below ? 'true' : 'false', abstained: false, confidence: null };
  }
  const argmax = keys.reduce((best, k) => (distribution[k] > distribution[best] ? k : best), keys[0]);
  const conf = confidence ?? choiceConfidence(question, distribution);
  if (question === 'Q2') return conf < THRESHOLDS.Q2.min_confidence ? { selected: null, abstained: true, confidence: conf } : { selected: argmax, abstained: false, confidence: conf };
  const t = THRESHOLDS[question as 'Q3' | 'Q4'];
  return { selected: conf < t.min_confidence ? t.fallback : argmax, abstained: false, confidence: conf };
}
