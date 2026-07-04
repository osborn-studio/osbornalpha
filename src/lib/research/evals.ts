/**
 * Eval harness service (Research OS Phase 4, spec §4.8/§10).
 * Historical time-point evaluation: as_of + then-visible materials → the agent
 * writes a memo (NOT persisted to memos) → a SEPARATE judge LLM call scores it
 * against the real subsequent events on the case rubric → run + failure modes
 * are persisted with double provenance {gen, judge}.
 *
 * Red lines honored here:
 * - builder≠judge: two independent prompts/calls; the judge never sees the gen
 *   prompt (see eval-prompt.ts).
 * - Scores validated: every rubric key present, clamped to 0-10 with
 *   'judge_out_of_range'; a failure at ANY stage persists nothing.
 * - audit_log on case create + run.
 */

import { logAudit, type ResearchDb } from './db';
import { defaultLlm, type LlmFn } from './memos';
import { validateMemoDraft } from './memo-prompt';
import {
  buildEvalGenPrompt,
  buildEvalJudgePrompt,
  computeWeightedTotal,
  validateJudgeVerdict,
} from './eval-prompt';
import {
  DEFAULT_EVAL_RUBRIC,
  readJson,
  writeJson,
  type EvalCase,
  type EvalRun,
  type EvalRunOutput,
  type SourceDocument,
} from './types';

export class EvalError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'EvalError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function rowToEvalCase(row: any): EvalCase {
  return {
    id: row.id,
    title: row.title,
    as_of: row.as_of,
    visible_material: readJson<string[]>(row.visible_material, []),
    expected: readJson<{ notes: string }>(row.expected_output, { notes: '' }),
    outcome: row.outcome ?? '',
    rubric: readJson<Record<string, number>>(row.rubric, { ...DEFAULT_EVAL_RUBRIC }),
    created_at: row.created_at,
  };
}

function rowToEvalRun(row: any): EvalRun {
  // total travels inside the scores JSON column (schema v2 has no extra column).
  const { total = 0, ...scores } = readJson<Record<string, number>>(row.scores, {});
  return {
    id: row.id,
    case_id: row.case_id,
    output: readJson<EvalRunOutput>(row.output, {
      memo: {
        title: '', one_line_conclusion: '', thesis: '',
        supporting_evidence: [], counter_arguments: [], key_variables: [],
        invalidation_conditions: [], open_questions: [], related_impacts: [],
        confidence: 'LOW',
      },
      rationale_per_dimension: {},
      provenance: { gen: {}, judge: {} },
    }),
    scores,
    total,
    failure_modes: readJson<string[]>(row.failure_modes, []),
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

/** Validate → insert eval_cases → audit_log('eval.case_create'). */
export function createEvalCase(db: ResearchDb, input: CreateEvalCaseInput): EvalCase {
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
  const existsStmt = db.prepare(`select 1 from source_documents where id = ?`);
  for (const id of sourceIds) {
    if (!existsStmt.get(id)) throw new EvalError(`source document not found: ${id}`, 404);
  }
  const rubric = normalizeRubric(input.rubric);
  const expectedNotes = typeof input.expected_notes === 'string' ? input.expected_notes.trim() : '';

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into eval_cases
       (id, title, as_of, visible_material, expected_output, outcome, rubric, created_at)
     values (?, ?, ?, ?, ?, '', ?, ?)`,
  ).run(
    id, title, input.as_of_date,
    writeJson(sourceIds), writeJson({ notes: expectedNotes }), writeJson(rubric), now,
  );
  logAudit(db, 'eval.case_create', id, {
    title, as_of: input.as_of_date, source_count: sourceIds.length,
  });
  return getEvalCase(db, id)!;
}

export function getEvalCase(db: ResearchDb, id: string): EvalCase | null {
  const row = db.prepare(`select * from eval_cases where id = ?`).get(id);
  return row ? rowToEvalCase(row) : null;
}

export function listEvalCases(db: ResearchDb): EvalCase[] {
  return db.prepare(`select * from eval_cases order by created_at desc`).all().map(rowToEvalCase);
}

export interface EvalCaseSummary extends EvalCase {
  run_count: number;
  last_run_at: string | null;
  last_total: number | null;
}

/** Cases + run count + most recent run's total (for the Eval Lab list). */
export function listEvalCaseSummaries(db: ResearchDb): EvalCaseSummary[] {
  const rows: any[] = db
    .prepare(
      `select c.*,
              (select count(*) from eval_runs r where r.case_id = c.id) as run_count,
              (select r.created_at from eval_runs r where r.case_id = c.id
                 order by r.created_at desc, r.id desc limit 1) as last_run_at,
              (select r.scores from eval_runs r where r.case_id = c.id
                 order by r.created_at desc, r.id desc limit 1) as last_scores
       from eval_cases c
       order by c.created_at desc`,
    )
    .all();
  return rows.map((row) => {
    const lastScores = readJson<Record<string, number>>(row.last_scores, {});
    return {
      ...rowToEvalCase(row),
      run_count: row.run_count as number,
      last_run_at: (row.last_run_at as string | null) ?? null,
      last_total: row.last_scores == null ? null : lastScores.total ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Runs

export function getEvalRun(db: ResearchDb, id: string): EvalRun | null {
  const row = db.prepare(`select * from eval_runs where id = ?`).get(id);
  return row ? rowToEvalRun(row) : null;
}

export function listEvalRuns(db: ResearchDb, caseId?: string): EvalRun[] {
  const rows: any[] = caseId
    ? db.prepare(`select * from eval_runs where case_id = ? order by created_at desc, id desc`).all(caseId)
    : db.prepare(`select * from eval_runs order by created_at desc, id desc`).all();
  return rows.map(rowToEvalRun);
}

function loadCaseSources(db: ResearchDb, evalCase: EvalCase): SourceDocument[] {
  const stmt = db.prepare(`select * from source_documents where id = ?`);
  const sources: SourceDocument[] = [];
  for (const id of evalCase.visible_material) {
    const row = stmt.get(id);
    if (!row) throw new EvalError(`case material missing from library: ${id}`, 409);
    sources.push({ ...row, entity_ids: readJson<string[]>(row.entity_ids, []) });
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
 * scores → persist eval_runs + audit_log('eval.run').
 * Provider/parse failures at either stage return a structured result and
 * persist NOTHING (no half-runs). Unknown case → EvalError 404.
 */
export async function runEval(
  db: ResearchDb,
  caseId: string,
  llm: LlmFn = defaultLlm,
): Promise<RunEvalResult> {
  const evalCase = getEvalCase(db, caseId);
  if (!evalCase) throw new EvalError('eval case not found', 404);
  const sources = loadCaseSources(db, evalCase);

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
  db.prepare(
    `insert into eval_runs (id, case_id, output, scores, failure_modes, created_at)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(
    id, caseId,
    writeJson(output),
    writeJson({ ...verdict.scores, total }),
    writeJson(verdict.failure_modes),
    now,
  );
  logAudit(db, 'eval.run', id, {
    case_id: caseId,
    total,
    gen_model: genModel,
    judge_model: judgeModel,
    gen_prompt_sha256: genPrompt.prompt_sha256,
    judge_prompt_sha256: judgePrompt.prompt_sha256,
    failure_modes: verdict.failure_modes,
  });
  return { run: getEvalRun(db, id)!, llm: { source: 'llm', gen_model: genModel, judge_model: judgeModel } };
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

export function evalAggregate(db: ResearchDb): EvalAggregate {
  const caseCount = (db.prepare(`select count(*) c from eval_cases`).get() as any).c as number;
  const runs = listEvalRuns(db);

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
