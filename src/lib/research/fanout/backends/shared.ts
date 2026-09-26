import { QUESTIONS, decide, type QuestionId } from '../questions';
import type { BackendAnswer } from './types';

/** Validate a raw distribution against the question's option keys; null when it is unusable. */
export function parseDistribution(question: QuestionId, raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const def = QUESTIONS[question];
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!def.options.includes(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
    out[k] = v; sum += v;
  }
  if (Object.keys(out).length === 0 || sum < 0.98 || sum > 1.02) return null;
  return out;
}

export function abstention(thesis_id: string, question_id: QuestionId): BackendAnswer {
  return { thesis_id, question_id, distribution: {}, selected: null, confidence: null, abstained: true };
}

export function decided(thesis_id: string, question_id: QuestionId, distribution: Record<string, number>, confidence: number | null): BackendAnswer {
  const d = decide(question_id, distribution, confidence);
  return { thesis_id, question_id, distribution, selected: d.selected, confidence: d.confidence, abstained: d.abstained };
}

/** Rough token estimate for cost when the provider returns no usage (CJK ≈ 1 token per char, Latin ≈ 4 chars per token). */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

export const microsForTokens = (tokens: number, microsPer1k: number) => Math.round((tokens / 1000) * microsPer1k);
