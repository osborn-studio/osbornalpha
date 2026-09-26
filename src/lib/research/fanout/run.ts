/**
 * WP-A6 fan-out run: every new Source × every ACTIVE/WATCH/AT_RISK thesis is
 * answered by the rule backend and, for public material within budget, by
 * llm_deepseek and jev. Each answer becomes an append-only judgment. This
 * phase never writes thesis events and never changes thesis status.
 */
import { randomUUID } from 'node:crypto';
import { canonicalize, digest } from '../ingest/pa-v1/json.js';
import { listEntityKeys } from '../entity-keys/store';
import { entityTableVersion } from '../entity-keys/store';
import type { LlmFn } from '../memos';
import { transaction, type S4Actor } from '../s4/db';
import { recordJudgment, type JudgmentBackend, type JudgmentInput } from '../s4/ledger';
import { legacySourceVisible, rowToSource } from '../sources';
import type { ResearchCtx } from '../store';
import { listThesesByStatus } from '../theses';
import type { SourceDocument, Thesis } from '../types';
import type { BackendAnswer, BackendResult, FanoutBackend, FanoutInput } from './backends/types';
import { budgetState, readBudgetConfig, type BudgetConfig, type BudgetState } from './budget';
import { QUESTION_SET_VERSION } from './questions';

const DEFAULT_WINDOW_DAYS = 7;
const ACTIVE_STATUSES = ['ACTIVE','WATCH','AT_RISK'] as const;

export interface RunOptions {
  ctx: ResearchCtx;
  actor: S4Actor;
  backends: { rule: FanoutBackend; deepseek: FanoutBackend | null; jev: FanoutBackend | null };
  /** LLM used for jev_escalated explanations; null disables escalation. */
  escalate: LlmFn | null;
  sinceIso?: string;
  budget?: BudgetConfig;
  runId?: string;
}

interface BackendStats { answers: number; skipped: number; errors: number; cost_micros: number }
export interface RunSummary {
  run_id: string;
  sources: number;
  theses: number;
  /** conflict: same content address already holds a different answer (kept; the run continues and audits). */
  judgments: { written: number; duplicate: number; conflict: number };
  per_backend: Record<'rule' | 'llm_deepseek' | 'jev' | 'jev_escalated', BackendStats>;
  private_sources_skipped_external: number;
  budget: BudgetState;
  entity_table_version: string;
}

export function thesisVersion(t: Thesis): string {
  return digest({ title: t.title, body: t.body, invalidation_conditions: t.invalidation_conditions, watch_metrics: t.watch_metrics, updated_at: t.updated_at });
}

/** External models only see public material that is not a private observation (§6.2, §11). */
export function mayLeaveMachine(source: SourceDocument): boolean {
  return source.permission === 'public' && source.origin_type !== 'private_observation';
}

async function listSourcesSince(ctx: ResearchCtx, sinceIso: string): Promise<SourceDocument[]> {
  const { data, error } = await ctx.supabase.from('research_source_documents').select('*').eq('user_id', ctx.userId)
    .gte('ingested_at', sinceIso).order('ingested_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(legacySourceVisible).map(rowToSource);
}

/** thesis_id → names/aliases of its companies from the entity table and legacy entity rows. */
async function aliasMap(ctx: ResearchCtx, theses: Thesis[]): Promise<Map<string, string[]>> {
  const keys = await listEntityKeys(ctx);
  const byEntity = new Map<string, string[]>();
  for (const k of keys) byEntity.set(k.entity_id, [...k.names_zh, ...k.names_en, ...k.aliases]);
  const ids = [...new Set(theses.flatMap(t => t.company_ids))];
  if (ids.length) {
    const { data, error } = await ctx.supabase.from('research_entities').select('id, name, aliases').eq('user_id', ctx.userId).in('id', ids);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) byEntity.set(r.id, [...(byEntity.get(r.id) ?? []), r.name, ...(Array.isArray(r.aliases) ? r.aliases : [])]);
  }
  return new Map(theses.map(t => [t.id, [...new Set(t.company_ids.flatMap(id => byEntity.get(id) ?? []))]]));
}

async function spentToday(actor: S4Actor): Promise<number> {
  return transaction(actor, async db => Number((await db.query(
    `select coalesce(sum(cost_micros),0) n from public.research_judgments where user_id=$1 and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`, [actor.userId])).rows[0].n));
}

async function auditRun(actor: S4Actor, action: string, detail: Record<string, unknown>) {
  await transaction(actor, async db => {
    await db.query(`insert into public.research_audit_log(id,user_id,actor,action,object_type,object_id,detail,created_at) values($1,$2,$3,$4,'fanout',null,$5,clock_timestamp())`,
      [randomUUID(), actor.userId, actor.kind, action, canonicalize(detail)]);
  });
}

export async function runFanout(opts: RunOptions): Promise<RunSummary> {
  const run_id = opts.runId ?? randomUUID();
  const budget = opts.budget ?? readBudgetConfig();
  const since = opts.sinceIso ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString();
  const stats = (): BackendStats => ({ answers: 0, skipped: 0, errors: 0, cost_micros: 0 });
  const summary: RunSummary = { run_id, sources: 0, theses: 0, judgments: { written: 0, duplicate: 0, conflict: 0 },
    per_backend: { rule: stats(), llm_deepseek: stats(), jev: stats(), jev_escalated: stats() },
    private_sources_skipped_external: 0, budget: budgetState(0, budget.daily_budget_micros), entity_table_version: '' };

  const [theses, sources] = await Promise.all([listThesesByStatus(opts.ctx, [...ACTIVE_STATUSES]), listSourcesSince(opts.ctx, since)]);
  summary.theses = theses.length; summary.sources = sources.length;
  if (theses.length === 0 || sources.length === 0) return summary;
  const [aliases, entity_table_version] = await Promise.all([aliasMap(opts.ctx, theses), entityTableVersion(opts.ctx)]);
  summary.entity_table_version = entity_table_version;
  const versions = new Map(theses.map(t => [t.id, thesisVersion(t)]));

  let spent = await spentToday(opts.actor);
  let stopAudited = false;
  for (const source of sources) {
    const input: FanoutInput = { source, theses, aliases, askQ5: !!source.cluster_id && source.cluster_first !== true };
    const external = mayLeaveMachine(source);
    if (!external) summary.private_sources_skipped_external++;
    summary.budget = budgetState(spent, budget.daily_budget_micros);
    if (summary.budget.stopped && !stopAudited) {
      await auditRun(opts.actor, 'fanout.budget_stop', { run_id, spent_micros: spent, limit_micros: budget.daily_budget_micros, source_id: source.id });
      stopAudited = true;
    }
    const useExternal = external && !summary.budget.stopped;
    const results = await Promise.all([
      opts.backends.rule(input),
      useExternal && opts.backends.deepseek ? opts.backends.deepseek(input) : null,
      useExternal && opts.backends.jev ? opts.backends.jev(input) : null,
    ]);
    for (const result of results) {
      if (!result) continue;
      const stat = summary.per_backend[result.backend as keyof RunSummary['per_backend']];
      if (result.skipped) {
        stat.skipped++;
        if (result.skipped === 'error') { stat.errors++; await auditRun(opts.actor, 'fanout.backend_error', { run_id, backend: result.backend, source_id: source.id, error: result.error ?? null }); }
        continue;
      }
      await writeAnswers(opts, run_id, source, versions, entity_table_version, result, summary);
      stat.answers += result.answers.length; stat.cost_micros += result.cost_micros; spent += result.cost_micros;
    }
    const jev = results[2];
    if (jev && !jev.skipped && opts.escalate) await escalate(opts, run_id, source, versions, entity_table_version, jev, summary);
  }
  summary.budget = budgetState(spent, budget.daily_budget_micros);
  await auditRun(opts.actor, 'fanout.run', { run_id, sources: summary.sources, theses: summary.theses, judgments: summary.judgments, budget: summary.budget });
  return summary;
}

async function writeAnswers(opts: RunOptions, run_id: string, source: SourceDocument, versions: Map<string, string>, entity_table_version: string, result: BackendResult, summary: RunSummary) {
  let first = true;
  for (const a of result.answers) {
    await record(opts, summary, source, result.backend as JudgmentBackend, {
      snapshot: { source_id: source.id, source_version: source.source_version ?? '1', thesis_id: a.thesis_id, thesis_version: versions.get(a.thesis_id)!, entity_table_version },
      run_id, question_set_version: QUESTION_SET_VERSION, question_id: a.question_id, backend: result.backend as JudgmentBackend, backend_model: result.backend_model,
      prompt_sha256: result.prompt_sha256, input_token_count: first ? result.input_token_count : 0, distribution: a.distribution, selected: a.selected,
      confidence: a.confidence, abstained: a.abstained, latency_ms: first ? result.latency_ms : 0, cost_micros: first ? result.cost_micros : 0 });
    first = false;
  }
}

/** §6.2: jev abstains on Q2 while Q1 > 0.8 → one explanatory sentence from the chat LLM, recorded as jev_escalated. */
async function escalate(opts: RunOptions, run_id: string, source: SourceDocument, versions: Map<string, string>, entity_table_version: string, jev: BackendResult, summary: RunSummary) {
  const byThesis = new Map<string, BackendAnswer[]>();
  for (const a of jev.answers) (byThesis.get(a.thesis_id) ?? byThesis.set(a.thesis_id, []).get(a.thesis_id)!).push(a);
  for (const [thesis_id, answers] of byThesis) {
    const q1 = answers.find(a => a.question_id === 'Q1'), q2 = answers.find(a => a.question_id === 'Q2');
    if (!q1 || !q2 || !q2.abstained || (q1.distribution.true ?? 0) <= 0.8) continue;
    const thesis = opts.ctx && (await listThesesByStatus(opts.ctx, [...ACTIVE_STATUSES])).find(t => t.id === thesis_id);
    const started = Date.now();
    let content: string, model: string;
    try {
      const r = await opts.escalate!({ system: '你是研究助理。用一句中文说明为什么这份材料与该 thesis 相关但作用方向不明确。不要给操作建议，不要改变任何状态。',
        user: `thesis：${thesis?.title ?? thesis_id}\n失效条件：${thesis?.invalidation_conditions.join('；') ?? ''}\n材料：${source.title}\n${source.raw_text.slice(0, 4000)}` });
      content = r.content.trim(); model = r.model;
    } catch (e) {
      summary.per_backend.jev_escalated.errors++;
      await auditRun(opts.actor, 'fanout.backend_error', { run_id, backend: 'jev_escalated', source_id: source.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const outcome = await record(opts, summary, source, 'jev_escalated', {
      snapshot: { source_id: source.id, source_version: source.source_version ?? '1', thesis_id, thesis_version: versions.get(thesis_id)!, entity_table_version },
      run_id, question_set_version: QUESTION_SET_VERSION, question_id: 'Q2', backend: 'jev_escalated', backend_model: model, prompt_sha256: null, input_token_count: null,
      distribution: { explanation: content } as unknown as Record<string, unknown>, selected: null, confidence: null, abstained: true, latency_ms: Date.now() - started, cost_micros: 0 });
    if (outcome !== 'conflict') summary.per_backend.jev_escalated.answers++;
  }
}

/** Append one judgment; a content-address conflict is audited and counted, never fatal for the run. */
async function record(opts: RunOptions, summary: RunSummary, source: SourceDocument, backend: JudgmentBackend, input: JudgmentInput): Promise<'written' | 'duplicate' | 'conflict'> {
  try {
    const receipt = await recordJudgment(opts.actor, input);
    if (receipt.duplicate) { summary.judgments.duplicate++; return 'duplicate'; }
    summary.judgments.written++; return 'written';
  } catch (e) {
    if ((e as { code?: string })?.code !== 'idempotency_conflict') throw e;
    summary.judgments.conflict++;
    await auditRun(opts.actor, 'fanout.judgment_conflict', { run_id: input.run_id, backend, source_id: source.id, thesis_id: input.snapshot.thesis_id, question_id: input.question_id });
    return 'conflict';
  }
}
