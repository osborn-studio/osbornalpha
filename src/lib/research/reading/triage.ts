/**
 * WP-B4 (Alpha side): the Jev shadow triage for Brain reading plans. One System One request per
 * item asks three nouls per active thesis (relevant / counter-evidence / novel); the item-level
 * triage is derived deterministically. Pure logic; scripts/reading/judge-triage.ts owns I/O.
 * Contracts: Osborn-brain config/reading-triage-items.schema.json and reading-triage-answers.schema.json.
 */
import { createHash } from 'node:crypto';
import { JEV_MODEL, JEV_URL } from '../fanout/backends/jev';
import { estimateTokens, microsForTokens } from '../fanout/backends/shared';
import { canonicalJson } from '../wiki/source-pack';

export const TRIAGE_QUESTION_VERSION = 'triage/1.0';
export const TRIAGE_QUESTIONS = {
  TR1: { type: 'noul' as const, instructions: '这份材料是否与该 thesis 的支柱、观察指标或失效条件相关？', criteria: { true: '材料内容直接涉及该 thesis 的支柱、观察指标或失效条件', false: '材料与该 thesis 无关' } },
  TR2: { type: 'noul' as const, instructions: '这份材料是否包含削弱该 thesis 或触发其失效条件的事实？', criteria: { true: '材料给出与支柱相反、或满足失效条件的事实', false: '材料没有这类反证' } },
  TR3: { type: 'noul' as const, instructions: '相对该 thesis 已记录的支柱与催化剂，这份材料是否包含新增事实？', criteria: { true: '材料包含 thesis 记录之外的新事实', false: '材料只是重复或转述已知内容' } },
} as const;
export type TriageQuestionId = keyof typeof TRIAGE_QUESTIONS;
/** §6.1-style bands: relevant above / irrelevant below with an abstention band in between. */
export const TRIAGE_THRESHOLDS = { relevant_above: 0.6, irrelevant_below: 0.4, counter_above: 0.6, novel_above: 0.5 } as const;
const TEXT_CHARS = 24_000;

export interface TriageItem {
  item_id: string; version_id: string; title: string; source_url: string | null; text: string; body_sha256: string;
  local: { selected: boolean; disposition: string; semantic_conclusion: string | null };
}
export interface TriageItemsDocument {
  schema_name: 'brain-reading-triage-items'; schema_version: '1.0'; generated_at: string; plan_id: string; policy_version: string; question: string;
  items: TriageItem[]; excluded: { item_id: string; reason: string }[];
}
export interface TriageThesis { id: string; title: string; pillars: string[]; invalidation_conditions: string[]; catalysts: string[] }
export interface TriageVerdict {
  thesis_id: string; relevant: boolean | null; counter: boolean | null; novel: boolean | null;
  p_relevant: number | null; p_counter: number | null; p_novel: number | null;
}
export type TriageDecision = 'read' | 'skip' | 'abstain';
export interface TriageAnswer { item_id: string; triage: TriageDecision; verdicts: TriageVerdict[]; backend_model: string; cost_micros: number }
export interface TriageAnswersDocument {
  schema_name: 'alpha-reading-triage-answers'; schema_version: '1.0'; generated_at: string; items_hash: string; question_version: string;
  theses: { thesis_id: string; title: string }[]; answers: TriageAnswer[];
}

export function itemsHash(doc: TriageItemsDocument): string {
  const { generated_at: _ignored, ...rest } = doc;
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex');
}

/** One request per item; only pack material and thesis text enter the state (no ids of Brain's local view). */
export function buildTriageRequest(item: TriageItem, theses: TriageThesis[]) {
  const questions: Record<string, unknown> = {};
  theses.forEach((_, i) => {
    for (const q of Object.keys(TRIAGE_QUESTIONS) as TriageQuestionId[]) {
      const def = TRIAGE_QUESTIONS[q];
      questions[`t${i}_${q}`] = { type: def.type, instructions: def.instructions, criteria: def.criteria };
    }
  });
  return {
    state: {
      material: { title: item.title, url: item.source_url, text: item.text.slice(0, TEXT_CHARS) },
      theses: theses.map(t => ({ id: t.id, title: t.title, pillars: t.pillars, invalidation_conditions: t.invalidation_conditions, catalysts: t.catalysts })),
    },
    model: JEV_MODEL,
    questions,
  };
}

const prob = (raw: unknown): number | null => {
  if (!raw || typeof raw !== 'object' || (raw as any).type !== 'noul') return null;
  const p = (raw as any).noul;
  return typeof p === 'number' && p >= 0 && p <= 1 ? Math.round(p * 1000) / 1000 : null;
};
const band = (p: number | null, above: number, below: number | null): boolean | null => {
  if (p === null) return null;
  if (p > above) return true;
  if (below === null) return false;
  return p < below ? false : null;
};

export function parseTriageAnswers(theses: TriageThesis[], answers: Record<string, unknown> | undefined): { triage: TriageDecision; verdicts: TriageVerdict[] } {
  const verdicts: TriageVerdict[] = theses.map((t, i) => {
    const pr = prob(answers?.[`t${i}_TR1`]), pc = prob(answers?.[`t${i}_TR2`]), pn = prob(answers?.[`t${i}_TR3`]);
    return {
      thesis_id: t.id,
      relevant: band(pr, TRIAGE_THRESHOLDS.relevant_above, TRIAGE_THRESHOLDS.irrelevant_below),
      counter: band(pc, TRIAGE_THRESHOLDS.counter_above, null),
      novel: band(pn, TRIAGE_THRESHOLDS.novel_above, null),
      p_relevant: pr, p_counter: pc, p_novel: pn,
    };
  });
  const decided = verdicts.filter(v => v.relevant !== null);
  const triage: TriageDecision = decided.length === 0 ? 'abstain'
    : verdicts.some(v => v.relevant === true && (v.counter === true || v.novel === true)) ? 'read' : 'skip';
  return { triage, verdicts };
}

export function estimateForItem(item: TriageItem, theses: TriageThesis[], microsPer1kTokens = 45): number {
  return microsForTokens(estimateTokens(JSON.stringify(buildTriageRequest(item, theses))), microsPer1kTokens);
}

export interface JudgeTriageOptions {
  items: TriageItem[]; theses: TriageThesis[]; existing: Array<{ item_id: string }>; fetch: typeof fetch; apiKey: string;
  maxCostUsd: number; now: () => string; microsPer1kTokens?: number; timeoutMs?: number;
}
export interface JudgeTriageResult {
  answers: TriageAnswer[]; spent_micros: number; failed_charged_micros: number; stopped: boolean; skipped_existing: number;
  errors: Array<{ item_id: string; error: string }>;
}

/** Same budget discipline as judge-wl: reserve max(estimate, average), charge failures, keep them retryable. */
export async function judgeTriageItems(opts: JudgeTriageOptions): Promise<JudgeTriageResult> {
  const price = opts.microsPer1kTokens ?? 45;
  const budget = Math.round(opts.maxCostUsd * 1_000_000);
  const done = new Set(opts.existing.map(e => e.item_id));
  const out: JudgeTriageResult = { answers: [], spent_micros: 0, failed_charged_micros: 0, stopped: false, skipped_existing: 0, errors: [] };
  let calls = 0;
  for (const item of opts.items) {
    if (done.has(item.item_id)) { out.skipped_existing++; continue; }
    const body = JSON.stringify(buildTriageRequest(item, opts.theses));
    const estimate = microsForTokens(estimateTokens(body), price);
    const average = calls === 0 ? 0 : out.spent_micros / calls;
    if (out.spent_micros + Math.max(estimate, average) > budget) { out.stopped = true; break; }
    try {
      const res = await opts.fetch(JEV_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` }, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      if (!res.ok) throw new Error(`jev ${res.status}`);
      const data = await res.json() as { model?: string; answers?: Record<string, unknown>; usage?: { input_tokens?: number; output_tokens?: number } };
      const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      const cost = microsForTokens(tokens > 0 ? tokens : estimateTokens(body), price);
      const parsed = parseTriageAnswers(opts.theses, data.answers);
      out.answers.push({ item_id: item.item_id, triage: parsed.triage, verdicts: parsed.verdicts, backend_model: typeof data.model === 'string' && data.model ? data.model : JEV_MODEL, cost_micros: cost });
      calls++;
      out.spent_micros += cost;
    } catch (e) {
      out.errors.push({ item_id: item.item_id, error: e instanceof Error ? e.message : String(e) });
      out.failed_charged_micros += estimate;
      out.spent_micros += estimate;
      calls++;
    }
  }
  return out;
}

export function answersDocument(input: { items: TriageItemsDocument; theses: TriageThesis[]; answers: TriageAnswer[]; generatedAt: string }): TriageAnswersDocument {
  return { schema_name: 'alpha-reading-triage-answers', schema_version: '1.0', generated_at: input.generatedAt, items_hash: itemsHash(input.items),
    question_version: TRIAGE_QUESTION_VERSION, theses: input.theses.map(t => ({ thesis_id: t.id, title: t.title.slice(0, 500) })), answers: input.answers };
}
