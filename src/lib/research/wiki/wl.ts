/**
 * WP-B3 (Alpha side): the WL question for Brain's wiki lint, asked to Jev System One one
 * pair at a time. Pure logic here; the script (scripts/wiki/judge-wl.ts) owns I/O and the
 * public-only re-check. Contracts: Osborn-brain config/wiki-wl-pairs.schema.json and
 * config/wiki-wl-answers.schema.json.
 */
import { JEV_MODEL, JEV_URL } from '../fanout/backends/jev';
import { estimateTokens, microsForTokens } from '../fanout/backends/shared';
import { createHash } from 'node:crypto';
import { canonicalJson } from './source-pack';

export const WL_QUESTION_VERSION = 'wl/1.0';
export const WL_OPTIONS = ['contradicts', 'superseded', 'consistent', 'unrelated'] as const;
export type WlVerdict = typeof WL_OPTIONS[number];
export const WL_MIN_CONFIDENCE = 0.6;
export const WL_QUESTION = {
  type: 'choice' as const,
  options: WL_OPTIONS,
  instructions: 'Wiki 页面上的这条断言，与新材料片段之间是什么关系？只依据给出的文字判断。',
  criteria: {
    contradicts: '新材料与断言直接矛盾（事实相反或数字不符）',
    superseded: '新材料表明断言已过时、被后续事件取代',
    consistent: '新材料与断言一致或进一步支持它',
    unrelated: '新材料与这条断言无关',
  } as Record<WlVerdict, string>,
};

export interface WlSnippet { source_id: string; source_version: string; start: number; end: number; text: string }
export interface WlPair {
  pair_id: string; page: string; entity_id: string; assertion_index: number; assertion_text: string;
  cited_snippets: WlSnippet[];
  candidate: { source_id: string; source_version: string; title: string; available_at: string; text: string };
}
export interface WlPairsDocument { schema_name: 'brain-wiki-wl-pairs'; schema_version: '1.0'; generated_at: string; pack_hash: string; pairs: WlPair[] }
export interface WlAnswer {
  pair_id: string; selected: WlVerdict | null; confidence: number | null; distribution: Partial<Record<WlVerdict, number>>;
  abstained: boolean; backend_model: string; cost_micros: number;
}
export interface WlAnswersDocument {
  schema_name: 'alpha-wiki-wl-answers'; schema_version: '1.0'; generated_at: string; pairs_hash: string; question_version: string; answers: WlAnswer[];
}

/** Identity of a pairs file: everything but the export timestamp (the source pack hash included). */
export function pairsHash(doc: WlPairsDocument): string {
  const { generated_at: _ignored, ...rest } = doc;
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex');
}

/** One System One request per pair; the pair id never leaves the machine. */
export function buildWlRequest(pair: WlPair) {
  return {
    state: {
      assertion: pair.assertion_text,
      cited: pair.cited_snippets.map(s => ({ source_id: s.source_id, source_version: s.source_version, text: s.text })),
      candidate: { source_id: pair.candidate.source_id, source_version: pair.candidate.source_version, title: pair.candidate.title,
        available_at: pair.candidate.available_at, text: pair.candidate.text },
    },
    model: JEV_MODEL,
    questions: { WL: { type: WL_QUESTION.type, instructions: WL_QUESTION.instructions, criteria: WL_QUESTION.criteria } },
  };
}

type Parsed = Pick<WlAnswer, 'selected' | 'confidence' | 'distribution' | 'abstained'>;
const ABSTAIN: Parsed = { selected: null, confidence: null, distribution: {}, abstained: true };

export function parseWlAnswer(raw: unknown): Parsed {
  if (!raw || typeof raw !== 'object' || (raw as any).type !== 'choice') return ABSTAIN;
  const probs = (raw as any).probabilities;
  if (!probs || typeof probs !== 'object' || Array.isArray(probs)) return ABSTAIN;
  const rawProbs: Partial<Record<WlVerdict, number>> = {};
  const distribution: Partial<Record<WlVerdict, number>> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(probs as Record<string, unknown>)) {
    if (!(WL_OPTIONS as readonly string[]).includes(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return ABSTAIN;
    rawProbs[k as WlVerdict] = v; distribution[k as WlVerdict] = Math.round(v * 1000) / 1000; sum += v;
  }
  if (Object.keys(distribution).length === 0 || sum < 0.98 || sum > 1.02) return ABSTAIN;
  const conf = (raw as any).confidence;
  const rawConfidence = typeof conf === 'number' && conf >= 0 && conf <= 1 ? conf : null;
  // Threshold on the raw value; rounding is only for serialization (0.5999 must still abstain).
  const confidence = rawConfidence === null ? null : Math.round(rawConfidence * 1000) / 1000;
  // The verdict comes from the raw probabilities; rounding is only for serialization.
  const best = (Object.entries(rawProbs) as [WlVerdict, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  if (rawConfidence === null || rawConfidence < WL_MIN_CONFIDENCE) return { selected: null, confidence, distribution, abstained: true };
  return { selected: best, confidence, distribution, abstained: false };
}

/** Pre-call cost estimate for one pair (request tokens × price), in micros. */
export function estimateForPair(pair: WlPair, microsPer1kTokens = 45): number {
  return microsForTokens(estimateTokens(JSON.stringify(buildWlRequest(pair))), microsPer1kTokens);
}

export interface JudgeOptions {
  pairs: WlPair[];
  existing: Array<{ pair_id: string }>;
  fetch: typeof fetch;
  apiKey: string;
  maxCostUsd: number;
  now: () => string;
  microsPer1kTokens?: number;
  timeoutMs?: number;
}
export interface JudgeResult {
  answers: WlAnswer[];
  /** Reported/estimated cost of successful calls plus the estimate charged for every failed call. */
  spent_micros: number;
  failed_charged_micros: number;
  stopped: boolean; skipped_existing: number;
  errors: Array<{ pair_id: string; error: string }>;
}

/**
 * Judge pairs in order until the budget cannot safely cover another call. The reserve for the
 * next call is the larger of its token estimate and the average actual cost so far, so a
 * run never overshoots by more than one typical call.
 */
export async function judgeWlPairs(opts: JudgeOptions): Promise<JudgeResult> {
  const price = opts.microsPer1kTokens ?? 45;
  const budget = Math.round(opts.maxCostUsd * 1_000_000);
  const done = new Set(opts.existing.map(e => e.pair_id));
  const out: JudgeResult = { answers: [], spent_micros: 0, failed_charged_micros: 0, stopped: false, skipped_existing: 0, errors: [] };
  let calls = 0;
  for (const pair of opts.pairs) {
    if (done.has(pair.pair_id)) { out.skipped_existing++; continue; }
    const request = buildWlRequest(pair);
    const body = JSON.stringify(request);
    const estimate = microsForTokens(estimateTokens(body), price);
    const average = calls === 0 ? 0 : out.spent_micros / calls;
    if (out.spent_micros + Math.max(estimate, average) > budget) { out.stopped = true; break; }
    let answer: WlAnswer;
    try {
      const res = await opts.fetch(JEV_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      if (!res.ok) throw new Error(`jev ${res.status}`);
      const data = await res.json() as { model?: string; answers?: Record<string, unknown>; usage?: { input_tokens?: number; output_tokens?: number } };
      const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      const cost = microsForTokens(tokens > 0 ? tokens : estimateTokens(body), price);
      answer = { pair_id: pair.pair_id, ...parseWlAnswer(data.answers?.WL), backend_model: typeof data.model === 'string' && data.model ? data.model : JEV_MODEL, cost_micros: cost };
      calls++;
      out.spent_micros += cost;
    } catch (e) {
      // Transport failures are not judgments: leave the pair unanswered so a rerun retries it.
      // The request may still have been billed, so its estimate is charged against the budget.
      out.errors.push({ pair_id: pair.pair_id, error: e instanceof Error ? e.message : String(e) });
      out.failed_charged_micros += estimate;
      out.spent_micros += estimate;
      calls++;
      continue;
    }
    out.answers.push(answer);
  }
  return out;
}

export function answersDocument(input: { pairs: WlPairsDocument; answers: WlAnswer[]; generatedAt: string }): WlAnswersDocument {
  return { schema_name: 'alpha-wiki-wl-answers', schema_version: '1.0', generated_at: input.generatedAt, pairs_hash: pairsHash(input.pairs),
    question_version: WL_QUESTION_VERSION, answers: input.answers };
}
export { canonicalJson };
