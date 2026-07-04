/**
 * Playbook runner (Research OS Phase 3, spec §3.4/§4.6/§4.7).
 * memo/thesis → proposed action → axiom gate (a source without invalidation
 * conditions can NEVER enter a playbook — spec acceptance line 1) → risk
 * policy (high-risk actions require human approval) → approval state machine
 * → restricted execution (CLOSE_THESIS reuses the Phase 2 transition guard).
 *
 * ⚠️ NO REAL TRADING anywhere in this module: PAPER_TRADE is a record and
 * nothing more — there is no brokerage integration and there never will be
 * one here. This is research assistance, not investment advice.
 */

import { logAudit, type ResearchDb } from './db';
import { defaultLlm, getMemo, loadAxioms, type LlmFn } from './memos';
import { listSignalsSince } from './signals';
import { ThesisError, getThesis, transitionThesis } from './theses';
import {
  buildPlaybookSuggestPrompt,
  validatePlaybookSuggestion,
  type PlaybookSuggestSource,
  type PlaybookSuggestion,
} from './playbook-prompt';
import {
  PROPOSED_ACTIONS,
  readJson,
  writeJson,
  type Axiom,
  type AxiomCheckResult,
  type EvidenceItem,
  type LlmProvenance,
  type PlaybookRun,
  type ApprovalStatus,
  type ProposedAction,
} from './types';

export class PlaybookError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'PlaybookError';
  }
}

/** Thrown when a BLOCK-severity axiom fails at create time — API → 422, run NOT persisted. */
export class AxiomBlocked extends PlaybookError {
  constructor(public results: AxiomCheckResult[]) {
    super(
      `playbook blocked by axioms: ${results
        .filter((r) => r.severity === 'BLOCK' && !r.passed)
        .map((r) => r.axiom_code)
        .join(', ')}`,
      422,
    );
    this.name = 'AxiomBlocked';
  }
}

// ---------------------------------------------------------------------------
// Risk policy — data-driven, not scattered through routes (plan T1).

/** High risk = paper trade + closing a thesis; both demand a human in the loop. */
export const ACTION_POLICY: Record<ProposedAction, { approval: 'REQUIRED' | 'NOT_REQUIRED' }> = {
  PAPER_TRADE: { approval: 'REQUIRED' },
  CLOSE_THESIS: { approval: 'REQUIRED' },
  UPDATE_THESIS: { approval: 'NOT_REQUIRED' },
  WATCHLIST: { approval: 'NOT_REQUIRED' },
  RESEARCH_MORE: { approval: 'NOT_REQUIRED' },
};

// ---------------------------------------------------------------------------
// Axiom gate (pure — mirrors checkMemoAxioms in axioms.ts)

/** What the gate needs to know about the memo/thesis a playbook starts from. */
export interface PlaybookSource {
  kind: 'memo' | 'thesis';
  id: string;
  title: string;
  invalidation_conditions: string[];
  /** memo sources only. */
  counter_arguments?: EvidenceItem[];
}

export interface PlaybookCheckInput {
  proposed_action: ProposedAction;
  rationale: string;
}

const PROMISE_PATTERN = /必涨|保证|稳赚|无风险/;

type PlaybookRuleFn = (
  input: PlaybookCheckInput,
  source: PlaybookSource,
) => { passed: boolean; message: string };

/**
 * Phase 1 axiom seeds adapted to the playbook context by a hard code→rule
 * mapping (the axioms table has no applies_to column — implementation kept
 * simple per plan T1; unknown/disabled codes are skipped, forward-compatible).
 */
const PLAYBOOK_RULES: Record<string, PlaybookRuleFn> = {
  // Spec acceptance line 1: no invalidation conditions → no playbook. Ever.
  AX001: (_input, source) => {
    const n = source.invalidation_conditions.filter((c) => c.trim() !== '').length;
    return {
      passed: n >= 1,
      message: n >= 1
        ? `来源 ${source.kind} 有 ${n} 条失效条件`
        : `来源 ${source.kind}「${source.title}」没有失效条件：不能进入 playbook`,
    };
  },
  // A memo with no counter-arguments cannot back an approval-required action.
  AX003: (input, source) => {
    if (source.kind !== 'memo') {
      return { passed: true, message: '来源是 thesis，不适用反方观点检查' };
    }
    if (ACTION_POLICY[input.proposed_action].approval !== 'REQUIRED') {
      return { passed: true, message: '动作无需审批，不受反方观点限制' };
    }
    const n = (source.counter_arguments ?? []).filter((c) => c.claim?.trim()).length;
    return {
      passed: n >= 1,
      message: n >= 1
        ? `memo 有 ${n} 条反方观点`
        : '来源 memo 没有反方观点：高风险动作不能进入审批',
    };
  },
  AX005: (input) => {
    const hit = input.rationale.match(PROMISE_PATTERN);
    return {
      passed: !hit,
      message: hit
        ? `rationale 含收益承诺话术「${hit[0]}」，直接阻断`
        : '无收益承诺话术',
    };
  },
};

/** Run every enabled axiom that has a playbook-context rule. Pure — no DB/IO. */
export function checkPlaybookAxioms(
  input: PlaybookCheckInput,
  source: PlaybookSource,
  axioms: Axiom[],
): AxiomCheckResult[] {
  const results: AxiomCheckResult[] = [];
  for (const axiom of axioms) {
    if (!axiom.enabled) continue;
    const rule = PLAYBOOK_RULES[axiom.code];
    if (!rule) continue;
    const { passed, message } = rule(input, source);
    results.push({ axiom_code: axiom.code, severity: axiom.severity, passed, message });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Row mapping + queries

function rowToPlaybookRun(row: any): PlaybookRun {
  return {
    id: row.id,
    memo_id: row.memo_id,
    thesis_id: row.thesis_id,
    proposed_action: row.proposed_action,
    rationale: row.rationale,
    risks: readJson<string[]>(row.risks, []),
    approval_status: row.approval_status,
    human_decision: row.human_decision,
    review_at: row.review_at,
    created_at: row.created_at,
  };
}

export function getPlaybookRun(db: ResearchDb, id: string): PlaybookRun | null {
  const row = db.prepare(`select * from playbook_runs where id = ?`).get(id);
  return row ? rowToPlaybookRun(row) : null;
}

export function listPlaybookRuns(
  db: ResearchDb,
  opts: { status?: ApprovalStatus } = {},
): PlaybookRun[] {
  const rows: any[] = opts.status
    ? db.prepare(
        `select * from playbook_runs where approval_status = ?
         order by created_at desc, id desc`,
      ).all(opts.status)
    : db.prepare(`select * from playbook_runs order by created_at desc, id desc`).all();
  return rows.map(rowToPlaybookRun);
}

/** Resolve + shape the memo/thesis a run points at (for the gate + UI summaries). */
export function loadPlaybookSource(
  db: ResearchDb,
  ref: { memo_id?: string | null; thesis_id?: string | null },
): PlaybookSource {
  const hasMemo = typeof ref.memo_id === 'string' && ref.memo_id.trim() !== '';
  const hasThesis = typeof ref.thesis_id === 'string' && ref.thesis_id.trim() !== '';
  if (hasMemo === hasThesis) {
    throw new PlaybookError('exactly one of memo_id or thesis_id is required', 422);
  }
  if (hasMemo) {
    const memo = getMemo(db, ref.memo_id!.trim());
    if (!memo) throw new PlaybookError('memo not found', 404);
    return {
      kind: 'memo',
      id: memo.id,
      title: memo.title,
      invalidation_conditions: memo.invalidation_conditions,
      counter_arguments: memo.counter_arguments,
    };
  }
  const thesis = getThesis(db, ref.thesis_id!.trim());
  if (!thesis) throw new PlaybookError('thesis not found', 404);
  return {
    kind: 'thesis',
    id: thesis.id,
    title: thesis.title,
    invalidation_conditions: thesis.invalidation_conditions,
  };
}

// ---------------------------------------------------------------------------
// Create (validation → axiom gate → risk policy → persist + audit)

export interface CreatePlaybookInput {
  memo_id?: string | null;
  thesis_id?: string | null;
  proposed_action: ProposedAction;
  rationale: string;
  risks: string[];
}

export interface CreatePlaybookResult {
  run: PlaybookRun;
  axiom_results: AxiomCheckResult[];
}

export function createPlaybookRun(db: ResearchDb, input: CreatePlaybookInput): CreatePlaybookResult {
  const source = loadPlaybookSource(db, input); // 422 / 404 on bad refs
  if (!PROPOSED_ACTIONS.includes(input.proposed_action)) {
    throw new PlaybookError(
      `proposed_action must be one of ${PROPOSED_ACTIONS.join(', ')}`, 422,
    );
  }
  if (typeof input.rationale !== 'string' || input.rationale.trim() === '') {
    throw new PlaybookError('rationale is required', 422);
  }
  const risks = Array.isArray(input.risks)
    ? input.risks.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim())
    : [];
  if (risks.length === 0) {
    throw new PlaybookError('risks requires at least one non-empty entry', 422);
  }
  // The only automated effect is a thesis transition — a CLOSE_THESIS run
  // must therefore start from a thesis.
  if (input.proposed_action === 'CLOSE_THESIS' && source.kind !== 'thesis') {
    throw new PlaybookError('CLOSE_THESIS requires a thesis source', 422);
  }

  const checkInput: PlaybookCheckInput = {
    proposed_action: input.proposed_action,
    rationale: input.rationale.trim(),
  };
  const axiomResults = checkPlaybookAxioms(checkInput, source, loadAxioms(db));
  if (axiomResults.some((r) => r.severity === 'BLOCK' && !r.passed)) {
    // The blocked attempt leaves an audit trace but the run is NOT persisted.
    logAudit(db, 'playbook.blocked', source.id, {
      source_kind: source.kind,
      proposed_action: input.proposed_action,
      results: axiomResults,
    });
    throw new AxiomBlocked(axiomResults);
  }

  const approval: ApprovalStatus =
    ACTION_POLICY[input.proposed_action].approval === 'REQUIRED' ? 'PENDING' : 'NOT_REQUIRED';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into playbook_runs
       (id, memo_id, thesis_id, proposed_action, rationale, risks,
        approval_status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    source.kind === 'memo' ? source.id : null,
    source.kind === 'thesis' ? source.id : null,
    input.proposed_action,
    input.rationale.trim(),
    writeJson(risks),
    approval,
    now,
  );
  logAudit(db, 'playbook.create', id, {
    source_kind: source.kind,
    source_id: source.id,
    proposed_action: input.proposed_action,
    approval_status: approval,
    axiom_results: axiomResults,
  });
  return { run: getPlaybookRun(db, id)!, axiom_results: axiomResults };
}

// ---------------------------------------------------------------------------
// Approval state machine (only PENDING moves) + restricted execution

export interface ExecutionOutcome {
  /** True only when an automated effect actually ran (CLOSE_THESIS success). */
  executed: boolean;
  /** Present when a guarded effect was rejected — also written to audit_log
   *  (playbook_runs has no detail column, so audit_log is the record). */
  execution_error?: string;
  note?: string;
}

export interface ApprovalResult {
  run: PlaybookRun;
  execution: ExecutionOutcome;
}

function requirePending(db: ResearchDb, id: string): PlaybookRun {
  const run = getPlaybookRun(db, id);
  if (!run) throw new PlaybookError('playbook run not found', 404);
  if (run.approval_status !== 'PENDING') {
    throw new PlaybookError(
      `only PENDING runs can be decided (current: ${run.approval_status})`, 422,
    );
  }
  return run;
}

function requireDecision(decision: unknown): string {
  if (typeof decision !== 'string' || decision.trim() === '') {
    throw new PlaybookError('decision is required', 422);
  }
  return decision.trim();
}

/**
 * Execute the ONLY restricted effects an approval may have:
 *   CLOSE_THESIS  → transitionThesis(…, 'CLOSED') through the Phase 2 guard;
 *                   a guard rejection leaves the run APPROVED and puts
 *                   execution_error into audit_log (no detail column on runs).
 *   UPDATE_THESIS → intent recorded; the human edits the thesis manually.
 *   PAPER_TRADE / WATCHLIST / RESEARCH_MORE → record only. There is no paper
 *   trade ledger in MVP (deliberate — Phase 4+), and NO path to real trading.
 */
function executeApproved(db: ResearchDb, run: PlaybookRun, decision: string): ExecutionOutcome {
  if (run.proposed_action === 'CLOSE_THESIS') {
    try {
      transitionThesis(db, run.thesis_id!, 'CLOSED', `playbook ${run.id} approved: ${decision}`);
      logAudit(db, 'playbook.execute', run.id, {
        proposed_action: run.proposed_action,
        effect: 'CLOSE_THESIS',
        thesis_id: run.thesis_id,
      });
      return { executed: true, note: `thesis ${run.thesis_id} closed via transition guard` };
    } catch (e) {
      if (!(e instanceof ThesisError)) throw e;
      logAudit(db, 'playbook.execute', run.id, {
        proposed_action: run.proposed_action,
        effect: 'NONE',
        execution_error: e.message,
        thesis_id: run.thesis_id,
      });
      return { executed: false, execution_error: e.message };
    }
  }
  logAudit(db, 'playbook.execute', run.id, {
    proposed_action: run.proposed_action,
    effect: 'RECORD_ONLY',
    note: 'no automated effect — paper record only, never real trading',
  });
  return {
    executed: false,
    note: 'record only: no automated effect (and never any real trading)',
  };
}

export interface DecisionInput {
  decision: string;
  /** Optional follow-up review date; defaults to the approval timestamp. */
  review_at?: string;
}

export function approvePlaybook(db: ResearchDb, id: string, input: DecisionInput): ApprovalResult {
  const run = requirePending(db, id);
  const decision = requireDecision(input.decision);
  const now = new Date().toISOString();
  const reviewAt =
    typeof input.review_at === 'string' && input.review_at.trim() !== ''
      ? input.review_at.trim()
      : now;
  db.prepare(
    `update playbook_runs
       set approval_status = 'APPROVED', human_decision = ?, review_at = ?
     where id = ?`,
  ).run(decision, reviewAt, id);
  logAudit(db, 'playbook.approve', id, {
    proposed_action: run.proposed_action,
    decision,
    review_at: reviewAt,
  });
  // Execute AFTER the approval is recorded: an execution failure must leave
  // the run APPROVED (the human decision stands; the effect just didn't apply).
  const execution = executeApproved(db, { ...run, human_decision: decision }, decision);
  return { run: getPlaybookRun(db, id)!, execution };
}

export function rejectPlaybook(
  db: ResearchDb,
  id: string,
  input: { decision: string },
): { run: PlaybookRun } {
  const run = requirePending(db, id);
  const decision = requireDecision(input.decision);
  const now = new Date().toISOString();
  db.prepare(
    `update playbook_runs
       set approval_status = 'REJECTED', human_decision = ?, review_at = ?
     where id = ?`,
  ).run(decision, now, id);
  logAudit(db, 'playbook.reject', id, {
    proposed_action: run.proposed_action,
    decision,
  });
  return { run: getPlaybookRun(db, id)! };
}

// ---------------------------------------------------------------------------
// LLM action suggester (T2) — suggestion only, never persisted directly:
// the human edits it in the UI and goes through createPlaybookRun (the gate).

const SUGGEST_WINDOW_DAYS = 7;

export type SuggestPlaybookResult =
  | {
      suggestion: PlaybookSuggestion;
      provenance: LlmProvenance;
      llm: { source: 'llm'; model: string };
    }
  | { suggestion: null; llm: { source: 'no-key' | 'error'; message: string } };

function loadSuggestSource(
  db: ResearchDb,
  ref: { memo_id?: string | null; thesis_id?: string | null },
): PlaybookSuggestSource {
  const hasMemo = typeof ref.memo_id === 'string' && ref.memo_id.trim() !== '';
  const hasThesis = typeof ref.thesis_id === 'string' && ref.thesis_id.trim() !== '';
  if (hasMemo === hasThesis) {
    throw new PlaybookError('exactly one of memo_id or thesis_id is required', 422);
  }
  if (hasMemo) {
    const memo = getMemo(db, ref.memo_id!.trim());
    if (!memo) throw new PlaybookError('memo not found', 404);
    return { kind: 'memo', memo };
  }
  const thesis = getThesis(db, ref.thesis_id!.trim());
  if (!thesis) throw new PlaybookError('thesis not found', 404);
  return { kind: 'thesis', thesis };
}

/**
 * LLM-suggest the next action for a memo/thesis using the last 7 days of
 * signals. Provider failures return structured results (never throw); the
 * suggestion is returned with provenance and audited, but NOT written to
 * playbook_runs — creation is a separate, human-initiated, axiom-gated step.
 */
export async function suggestPlaybookAction(
  db: ResearchDb,
  ref: { memo_id?: string | null; thesis_id?: string | null },
  llm: LlmFn = defaultLlm,
): Promise<SuggestPlaybookResult> {
  const source = loadSuggestSource(db, ref); // 422 / 404 on bad refs
  const since = new Date(Date.now() - SUGGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const prompt = buildPlaybookSuggestPrompt({
    source,
    recentSignals: listSignalsSince(db, since),
    axioms: loadAxioms(db),
  });

  let content: string;
  let model: string;
  try {
    const r = await llm({ system: prompt.system, user: prompt.user });
    content = r.content;
    model = r.model;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const noKey = /no llm provider configured/i.test(message);
    return { suggestion: null, llm: { source: noKey ? 'no-key' : 'error', message } };
  }

  const { extractJson } = await import('@/lib/data/sources/llm');
  const suggestion = validatePlaybookSuggestion(extractJson(content));
  if (!suggestion) {
    return {
      suggestion: null,
      llm: { source: 'error', message: 'LLM output was not a valid playbook suggestion' },
    };
  }

  const now = new Date().toISOString();
  const provenance: LlmProvenance = {
    model,
    prompt_sha256: prompt.prompt_sha256,
    generated_at: now,
  };
  const sourceId = source.kind === 'memo' ? source.memo.id : source.thesis.id;
  logAudit(db, 'playbook.suggest', sourceId, {
    source_kind: source.kind,
    proposed_action: suggestion.proposed_action,
    model,
    prompt_sha256: prompt.prompt_sha256,
    ...(suggestion.metadata.downgraded_from !== undefined
      ? { downgraded_from: suggestion.metadata.downgraded_from }
      : {}),
  });
  return { suggestion, provenance, llm: { source: 'llm', model } };
}
