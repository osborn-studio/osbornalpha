/**
 * Eval harness service (Research OS Phase 5 — Supabase Postgres, spec §4.8/§10).
 * Historical time-point evaluation: as_of + then-visible materials → the agent
 * writes a memo (NOT persisted to memos) → a SEPARATE judge LLM call scores it
 * against the real subsequent events on the case rubric → run + failure modes
 * are persisted with double provenance {gen, judge}.
 *
 * Column mapping: app EvalCase.as_of ↔ research_eval_cases.as_of_date (date);
 * EvalCase.expected {notes} + EvalCase.outcome live together in the `expected`
 * jsonb column ({notes, outcome}); EvalRun.output ↔ agent_output jsonb;
 * EvalRun.total ↔ total_score numeric.
 *
 * ⚠️ research_eval_runs.total_score is Postgres `numeric` — PostgREST
 * serializes it as a JSON STRING, so every read goes through coerceEvalRunRow
 * (Number()), exactly like portfolio/store.ts coerce*Row. Do not bypass it.
 *
 * Red lines honored here:
 * - builder≠judge: two independent prompts/calls; the judge never sees the gen
 *   prompt (see eval-prompt.ts).
 * - Scores validated: every rubric key present, clamped to 0-10 with
 *   'judge_out_of_range'; a failure at ANY stage persists nothing.
 * - audit_log on case create + run.
 */

import { audit, isUuid, type ResearchCtx } from './store';
import { defaultLlm, type LlmFn } from './memos';
import { validateMemoDraft } from './memo-prompt';
import { listSourcesByIds } from './sources';
import {
  buildEvalGenPrompt,
  buildEvalJudgePrompt,
  computeWeightedTotal,
  validateJudgeVerdict,
} from './eval-prompt';
import {
  DEFAULT_EVAL_RUBRIC,
  type EvalCase,
  type EvalRun,
  type EvalRunOutput,
  type SourceDocument,
} from './types';

const CASES = 'research_eval_cases';
const RUNS = 'research_eval_runs';

export class EvalError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'EvalError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function rowToEvalCase(row: any): EvalCase {
  const expected =
    row.expected && typeof row.expected === 'object' ? (row.expected as Record<string, unknown>) : {};
  const rubric =
    row.rubric && typeof row.rubric === 'object' && Object.keys(row.rubric).length > 0
      ? (row.rubric as Record<string, number>)
      : { ...DEFAULT_EVAL_RUBRIC };
  return {
    id: row.id,
    title: row.title,
    // Postgres `date` comes back as YYYY-MM-DD.
    as_of: typeof row.as_of_date === 'string' ? row.as_of_date.slice(0, 10) : row.as_of_date,
    visible_material: Array.isArray(row.visible_material) ? (row.visible_material as string[]) : [],
    expected: { notes: typeof expected.notes === 'string' ? expected.notes : '' },
    outcome: typeof expected.outcome === 'string' ? expected.outcome : '',
    rubric,
    created_at: row.created_at,
  };
}

const EMPTY_OUTPUT: EvalRunOutput = {
  memo: {
    title: '', one_line_conclusion: '', thesis: '',
    supporting_evidence: [], counter_arguments: [], key_variables: [],
    invalidation_conditions: [], open_questions: [], related_impacts: [],
    confidence: 'LOW',
  },
  rationale_per_dimension: {},
  provenance: { gen: {}, judge: {} },
};

/** ⚠️ numeric coercion boundary: total_score arrives as a JSON string. */
export function coerceEvalRunRow(row: any): EvalRun {
  return {
    id: row.id,
    case_id: row.case_id,
    output:
      row.agent_output && typeof row.agent_output === 'object' && !Array.isArray(row.agent_output)
        ? (row.agent_output as EvalRunOutput)
        : EMPTY_OUTPUT,
    scores:
      row.scores && typeof row.scores === 'object' ? (row.scores as Record<string, number>) : {},
    total: row.total_score == null ? 0 : Number(row.total_score),
    failure_modes: Array.isArray(row.failure_modes) ? (row.failure_modes as string[]) : [],
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Cases

export interface CreateEvalCaseInput {
  title: string;
  /** YYYY-MM-DD — the historical point in time the agent is boxed into. */
  as_of_date: string;
  source_document_ids: string[];
  /** What actually happened afterwards — the judge's ground truth. */
  expected_notes: string;
  /** Optional override; defaults to the 6-dimension equal-weight rubric. */
  rubric?: Record<string, number>;
}

function normalizeRubric(rubric: Record<string, number> | undefined): Record<string, number> {
  if (rubric === undefined) return { ...DEFAULT_EVAL_RUBRIC };
  if (!rubric || typeof rubric !== 'object' || Array.isArray(rubric)) {
    throw new EvalError('rubric must be an object of {dimension: weight}');
  }
  const entries = Object.entries(rubric);
  if (entries.length === 0) throw new EvalError('rubric must have at least 1 dimension');
  for (const [dim, weight] of entries) {
    if (!dim.trim()) throw new EvalError('rubric dimension names must be non-empty');
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
      throw new EvalError(`rubric weight for ${dim} must be a positive number`);
    }
  }
  return { ...rubric };
}

function validAsOfDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validate → insert research_eval_cases → audit('eval.case_create'). */
export async function createEvalCase(ctx: ResearchCtx, input: CreateEvalCaseInput): Promise<EvalCase> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new EvalError('title is required');
  if (typeof input.as_of_date !== 'string' || !validAsOfDate(input.as_of_date)) {
    throw new EvalError('as_of_date must be a valid YYYY-MM-DD date');
  }
  const sourceIds = Array.isArray(input.source_document_ids)
    ? [...new Set(input.source_document_ids.filter((s) => typeof s === 'string' && s.trim() !== ''))]
    : [];
  if (sourceIds.length === 0) {
    throw new EvalError('source_document_ids must contain at least 1 source');
  }
  const found = await listSourcesByIds(ctx, sourceIds);
  const foundIds = new Set(found.map((s) => s.id));
  for (const id of sourceIds) {
    if (!foundIds.has(id)) throw new EvalError(`source document not found: ${id}`, 404);
  }
  const rubric = normalizeRubric(input.rubric);
  const expectedNotes = typeof input.expected_notes === 'string' ? input.expected_notes.trim() : '';

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from(CASES).insert({
    id,
    user_id: ctx.userId,
    title,
    as_of_date: input.as_of_date,
    visible_material: sourceIds,
    expected: { notes: expectedNotes, outcome: '' },
    rubric,
    created_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'eval.case_create', id, {
    title, as_of: input.as_of_date, source_count: sourceIds.length,
  });
  return (await getEvalCase(ctx, id))!;
}

export async function getEvalCase(ctx: ResearchCtx, id: string): Promise<EvalCase | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(CASES)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToEvalCase(data) : null;
}

export async function listEvalCases(ctx: ResearchCtx): Promise<EvalCase[]> {
  const { data, error } = await ctx.supabase
    .from(CASES)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToEvalCase);
}

export interface EvalCaseSummary extends EvalCase {
  run_count: number;
  last_run_at: string | null;
  last_total: number | null;
}

/** Cases + run count + most recent run's total (for the Eval Lab list). */
export async function listEvalCaseSummaries(ctx: ResearchCtx): Promise<EvalCaseSummary[]> {
  const cases = await listEvalCases(ctx);
  if (cases.length === 0) return [];
  const runs = await listEvalRuns(ctx);
  const byCase = new Map<string, EvalRun[]>();
  for (const run of runs) {
    const list = byCase.get(run.case_id) ?? [];
    list.push(run);
    byCase.set(run.case_id, list);
  }
  return cases.map((c) => {
    const caseRuns = byCase.get(c.id) ?? []; // listEvalRuns is newest-first
    return {
      ...c,
      run_count: caseRuns.length,
      last_run_at: caseRuns[0]?.created_at ?? null,
      last_total: caseRuns.length ? caseRuns[0].total : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Runs

export async function getEvalRun(ctx: ResearchCtx, id: string): Promise<EvalRun | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(RUNS)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? coerceEvalRunRow(data) : null;
}

export async function listEvalRuns(ctx: ResearchCtx, caseId?: string): Promise<EvalRun[]> {
  let q = ctx.supabase
    .from(RUNS)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (caseId) q = q.eq('case_id', caseId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(coerceEvalRunRow);
}

async function loadCaseSources(ctx: ResearchCtx, evalCase: EvalCase): Promise<SourceDocument[]> {
  const found = await listSourcesByIds(ctx, evalCase.visible_material);
  const byId = new Map(found.map((s) => [s.id, s] as const));
  const sources: SourceDocument[] = [];
  for (const id of evalCase.visible_material) {
    const src = byId.get(id);
    if (!src) throw new EvalError(`case material missing from library: ${id}`, 409);
    sources.push(src);
  }
  return sources;
}

export type RunEvalResult =
  | { run: EvalRun; llm: { source: 'llm'; gen_model: string; judge_model: string } }
  | { run: null; llm: { source: 'no-key' | 'error'; stage: 'gen' | 'judge'; message: string } };

function llmFailure(stage: 'gen' | 'judge', e: unknown): RunEvalResult {
  const message = e instanceof Error ? e.message : String(e);
  const noKey = /no llm provider configured/i.test(message);
  return { run: null, llm: { source: noKey ? 'no-key' : 'error', stage, message } };
}

/**
 * Execute one eval run: time-boxed gen call → separated judge call → validated
 * scores → persist research_eval_runs + audit('eval.run').
 * Provider/parse failures at either stage return a structured result and
 * persist NOTHING (no half-runs). Unknown case → EvalError 404.
 */
export async function runEval(
  ctx: ResearchCtx,
  caseId: string,
  llm: LlmFn = defaultLlm,
): Promise<RunEvalResult> {
  const evalCase = await getEvalCase(ctx, caseId);
  if (!evalCase) throw new EvalError('eval case not found', 404);
  const sources = await loadCaseSources(ctx, evalCase);

  // Stage 1 — builder (time-boxed gen).
  const genPrompt = buildEvalGenPrompt(evalCase, sources);
  let genContent: string;
  let genModel: string;
  try {
    const r = await llm({ system: genPrompt.system, user: genPrompt.user });
    genContent = r.content;
    genModel = r.model;
  } catch (e) {
    return llmFailure('gen', e);
  }
  const { extractJson } = await import('@/lib/data/sources/llm');
  const genParsed = extractJson(genContent);
  if (!genParsed || typeof genParsed !== 'object') {
    return { run: null, llm: { source: 'error', stage: 'gen', message: 'gen output was not parseable JSON' } };
  }
  const genAt = new Date().toISOString();
  // Citation red line reused from Phase 1: ids outside the injected material
  // are stripped and the claim is flagged LOW_CONFIDENCE.
  const memo = validateMemoDraft(genParsed, genPrompt.source_document_ids);

  // Stage 2 — judge (separated role; never sees the gen prompt).
  const judgePrompt = buildEvalJudgePrompt(memo, evalCase, evalCase.rubric);
  let judgeContent: string;
  let judgeModel: string;
  try {
    const r = await llm({ system: judgePrompt.system, user: judgePrompt.user });
    judgeContent = r.content;
    judgeModel = r.model;
  } catch (e) {
    return llmFailure('judge', e);
  }
  const verdict = validateJudgeVerdict(extractJson(judgeContent), evalCase.rubric);
  if (!verdict) {
    return {
      run: null,
      llm: { source: 'error', stage: 'judge', message: 'judge output was not a valid verdict (scores must cover every rubric dimension)' },
    };
  }

  const now = new Date().toISOString();
  const total = computeWeightedTotal(verdict.scores, evalCase.rubric);
  const output: EvalRunOutput = {
    memo,
    rationale_per_dimension: verdict.rationale_per_dimension,
    provenance: {
      gen: { model: genModel, prompt_sha256: genPrompt.prompt_sha256, generated_at: genAt },
      judge: { model: judgeModel, prompt_sha256: judgePrompt.prompt_sha256, generated_at: now },
    },
  };
  const id = crypto.randomUUID();
  const { error } = await ctx.supabase.from(RUNS).insert({
    id,
    user_id: ctx.userId,
    case_id: caseId,
    agent_output: output,
    scores: verdict.scores,
    total_score: total,
    failure_modes: verdict.failure_modes,
    llm_provenance: output.provenance,
    created_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'eval.run', id, {
    case_id: caseId,
    total,
    gen_model: genModel,
    judge_model: judgeModel,
    gen_prompt_sha256: genPrompt.prompt_sha256,
    judge_prompt_sha256: judgePrompt.prompt_sha256,
    failure_modes: verdict.failure_modes,
  });
  return {
    run: (await getEvalRun(ctx, id))!,
    llm: { source: 'llm', gen_model: genModel, judge_model: judgeModel },
  };
}

// ---------------------------------------------------------------------------
// Aggregate report (Eval Lab 聚合区)

export interface EvalAggregate {
  case_count: number;
  run_count: number;
  /** Mean of run totals, null when there are no runs. */
  avg_total: number | null;
  /** dimension → mean score across all runs that scored that dimension. */
  dimension_averages: Record<string, number>;
  /** Top 10 failure modes by frequency. */
  failure_mode_top: Array<{ mode: string; count: number }>;
}

export async function evalAggregate(ctx: ResearchCtx): Promise<EvalAggregate> {
  const { data: caseRows, error: cErr } = await ctx.supabase
    .from(CASES)
    .select('id')
    .eq('user_id', ctx.userId);
  if (cErr) throw new Error(cErr.message);
  const caseCount = ((caseRows ?? []) as any[]).length;
  const runs = await listEvalRuns(ctx);

  const dimSums = new Map<string, { sum: number; n: number }>();
  const failureCounts = new Map<string, number>();
  let totalSum = 0;
  for (const run of runs) {
    totalSum += run.total;
    for (const [dim, score] of Object.entries(run.scores)) {
      const agg = dimSums.get(dim) ?? { sum: 0, n: 0 };
      agg.sum += score;
      agg.n += 1;
      dimSums.set(dim, agg);
    }
    for (const mode of run.failure_modes) {
      failureCounts.set(mode, (failureCounts.get(mode) ?? 0) + 1);
    }
  }

  const dimension_averages: Record<string, number> = {};
  for (const [dim, { sum, n }] of dimSums) {
    dimension_averages[dim] = Math.round((sum / n) * 100) / 100;
  }
  const failure_mode_top = [...failureCounts.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode))
    .slice(0, 10);

  return {
    case_count: caseCount,
    run_count: runs.length,
    avg_total: runs.length === 0 ? null : Math.round((totalSum / runs.length) * 100) / 100,
    dimension_averages,
    failure_mode_top,
  };
}
