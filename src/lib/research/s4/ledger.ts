/**
 * WP-A3 judgment ledger (implementation plan 2026-09-22 §5.4/§5.5).
 * Judgments are pure derivations addressed by their inputs; decisions and
 * outcomes are human events. All four tables are append-only (database
 * trigger) and every write here runs inside the S4 owner transaction.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canonicalize, digest, fail } from '../ingest/pa-v1/json.js';
import { serverTime, transaction, type S4Actor } from './db';

export const JUDGMENT_BACKENDS = ['rule','llm_deepseek','jev','jev_escalated','local_probe','human'] as const;
export type JudgmentBackend = typeof JUDGMENT_BACKENDS[number];

export interface JudgmentSnapshot {
  source_id: string;
  source_version: string;
  thesis_id: string;
  thesis_version: string;
  entity_table_version: string;
}
export interface JudgmentKey {
  snapshot_id: string;
  question_set_version: string;
  backend: JudgmentBackend;
  backend_model: string;
  question_id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 256;

/** sha256 of the canonical five-field snapshot. Extra keys are ignored. */
/** The five addressed fields only; extra keys never reach the hash or the row. */
export function normalizeSnapshot(snapshot: JudgmentSnapshot): JudgmentSnapshot {
  if (!isUuid(snapshot?.source_id) || !isUuid(snapshot?.thesis_id)) fail('invalid_schema');
  for (const k of ['source_version','thesis_version','entity_table_version'] as const) if (!text(snapshot[k])) fail('invalid_schema');
  return { source_id: snapshot.source_id, source_version: snapshot.source_version, thesis_id: snapshot.thesis_id,
    thesis_version: snapshot.thesis_version, entity_table_version: snapshot.entity_table_version };
}

export function snapshotId(snapshot: JudgmentSnapshot): string {
  return digest(normalizeSnapshot(snapshot));
}

/** Content-addressed uuid (RFC 9562 v8) over the §5.4 key; same inputs → same id. */
export function judgmentId(key: JudgmentKey): string {
  if (!SHA256.test(key?.snapshot_id ?? '')) fail('invalid_schema');
  if (!JUDGMENT_BACKENDS.includes(key.backend)) fail('invalid_schema');
  for (const k of ['question_set_version','backend_model','question_id'] as const) if (!text(key[k])) fail('invalid_schema');
  const hex = digest({ snapshot_id: key.snapshot_id, question_set_version: key.question_set_version, backend: key.backend,
    backend_model: key.backend_model, question_id: key.question_id });
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-${variant}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}


export interface JudgmentInput extends Omit<JudgmentKey,'snapshot_id'> {
  snapshot: JudgmentSnapshot;
  run_id: string;
  prompt_sha256?: string | null;
  input_token_count?: number | null;
  distribution: Record<string, unknown>;
  selected?: string | null;
  confidence?: number | null;
  abstained: boolean;
  latency_ms?: number | null;
  cost_micros?: number | null;
}
export interface JudgmentReceipt { id: string; snapshot_id: string; duplicate: boolean }

const optionalCount = (v: unknown) => v == null || (Number.isSafeInteger(v) && (v as number) >= 0);
const plainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));

/** Fields that define the judgment's content; runtime measurements are excluded. */
function judgmentContent(input: JudgmentInput) {
  return canonicalize({ snapshot: normalizeSnapshot(input.snapshot),
    prompt_sha256: input.prompt_sha256 ?? null, distribution: input.distribution, selected: input.selected ?? null,
    confidence: input.confidence ?? null, abstained: input.abstained });
}

function validateJudgment(input: JudgmentInput): { snapshot_id: string; id: string } {
  const snapshot_id = snapshotId(input.snapshot);
  const id = judgmentId({ snapshot_id, question_set_version: input.question_set_version, backend: input.backend,
    backend_model: input.backend_model, question_id: input.question_id });
  if (!isUuid(input.run_id) || typeof input.abstained !== 'boolean' || !plainObject(input.distribution)) fail('invalid_schema');
  if (input.prompt_sha256 != null && !SHA256.test(input.prompt_sha256)) fail('invalid_schema');
  if (input.selected != null && typeof input.selected !== 'string') fail('invalid_schema');
  if (input.confidence != null && !(typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1)) fail('invalid_schema');
  if (![input.input_token_count, input.latency_ms, input.cost_micros].every(optionalCount)) fail('invalid_schema');
  return { snapshot_id, id };
}

async function audit(db: PoolClient, actor: S4Actor, action: string, objectType: string, objectId: string, detail: Record<string, unknown>, at: string) {
  await db.query(`insert into public.research_audit_log(id,user_id,actor,action,object_type,object_id,detail,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), actor.userId, actor.kind, action, objectType, objectId, canonicalize(detail), at]);
}

async function exists(db: PoolClient, table: string, userId: string, id: string) {
  return !!(await db.query(`select 1 from public.${table} where user_id=$1 and id=$2`, [userId, id])).rowCount;
}

/**
 * Append a judgment. Same content at the same address → {duplicate:true} and
 * no new row; same address with different content → idempotency_conflict.
 * The owner must own both the source and the thesis named in the snapshot.
 */
export async function recordJudgment(actor: S4Actor, input: JudgmentInput): Promise<JudgmentReceipt> {
  const { snapshot_id, id } = validateJudgment(input);
  return transaction(actor, async db => {
    const existing = (await db.query('select snapshot,prompt_sha256,distribution,selected,confidence,abstained from public.research_judgments where user_id=$1 and id=$2', [actor.userId, id])).rows[0];
    if (existing) {
      const stored = canonicalize({ snapshot: existing.snapshot, prompt_sha256: existing.prompt_sha256, distribution: existing.distribution,
        selected: existing.selected, confidence: existing.confidence === null ? null : Number(existing.confidence), abstained: existing.abstained });
      if (stored !== judgmentContent(input)) fail('idempotency_conflict');
      return { id, snapshot_id, duplicate: true };
    }
    if (!await exists(db, 'research_source_documents', actor.userId, input.snapshot.source_id) ||
        !await exists(db, 'research_theses', actor.userId, input.snapshot.thesis_id)) fail('scope_denied');
    const at = await serverTime(db);
    await db.query(`insert into public.research_judgments(user_id,id,snapshot_id,snapshot,source_id,thesis_id,run_id,question_set_version,question_id,backend,backend_model,
      prompt_sha256,input_token_count,distribution,selected,confidence,abstained,latency_ms,cost_micros,created_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [actor.userId, id, snapshot_id, canonicalize(normalizeSnapshot(input.snapshot)), input.snapshot.source_id, input.snapshot.thesis_id, input.run_id,
       input.question_set_version, input.question_id, input.backend, input.backend_model, input.prompt_sha256 ?? null, input.input_token_count ?? null,
       canonicalize(input.distribution), input.selected ?? null, input.confidence ?? null, input.abstained, input.latency_ms ?? null, input.cost_micros ?? null, at]);
    await audit(db, actor, 'ledger.judgment', 'research_judgment', id, { snapshot_id, run_id: input.run_id, backend: input.backend, question_id: input.question_id }, at);
    return { id, snapshot_id, duplicate: false };
  });
}

export interface LabelInput { judgment_id: string; label: string; labeler: string }

/** Human or second-labeler label for an existing judgment (append-only). */
export async function addLabel(actor: S4Actor, input: LabelInput): Promise<{ id: string; labeled_at: string }> {
  if (!isUuid(input?.judgment_id) || !text(input.label) || !text(input.labeler)) fail('invalid_schema');
  return transaction(actor, async db => {
    if (!await exists(db, 'research_judgments', actor.userId, input.judgment_id)) fail('scope_denied');
    const id = randomUUID(), at = await serverTime(db);
    await db.query('insert into public.research_labels(user_id,id,judgment_id,label,labeler,labeled_at) values($1,$2,$3,$4,$5,$6)',
      [actor.userId, id, input.judgment_id, input.label, input.labeler, at]);
    await audit(db, actor, 'ledger.label', 'research_label', id, { judgment_id: input.judgment_id, labeler: input.labeler }, at);
    return { id, labeled_at: at };
  });
}

export const DECISION_ARMS = ['human_baseline','ai_candidate','collab','averaged'] as const;
export const DECISION_ACTIONS = ['adopt','shadow','reject','extend','invalidate'] as const;
export type DecisionArm = typeof DECISION_ARMS[number];
export type DecisionAction = typeof DECISION_ACTIONS[number];

export interface DecisionInput {
  thesis_id: string;
  /** ISO calendar date (YYYY-MM-DD) of the review week. */
  week_of: string;
  arm: DecisionArm;
  action: DecisionAction;
  reason: string;
  cited_judgment_ids?: string[];
  card_id?: string | null;
  time_spent_minutes?: number | null;
  /** Required for human_baseline: the instant the baseline was locked before any card was shown. */
  frozen_at?: string | null;
  workspace?: string;
  analyst_id?: string | null;
  /** WP-E4: the S4 observation this decision produced (must belong to the owner); null until one exists. */
  observation_id?: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const WORKSPACE = /^(personal|team:[A-Za-z0-9_-]{1,64})$/;
const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  const m = ISO_DATE.exec(v); if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
export const isIsoInstant = (v: unknown): v is string => typeof v === 'string' && ISO_INSTANT.test(v) && Number.isFinite(Date.parse(v));

/**
 * Append a human decision for a thesis. Every cited judgment must already be
 * in this owner's ledger; a human_baseline decision must carry frozen_at.
 */
export async function recordDecision(actor: S4Actor, input: DecisionInput): Promise<{ id: string; created_at: string }> {
  if (!isUuid(input?.thesis_id) || !isIsoDate(input.week_of) || !DECISION_ARMS.includes(input.arm) || !DECISION_ACTIONS.includes(input.action) || !text(input.reason)) fail('invalid_schema');
  const cited = input.cited_judgment_ids ?? [];
  if (!Array.isArray(cited) || !cited.every(isUuid) || new Set(cited).size !== cited.length) fail('invalid_schema');
  if (input.card_id != null && !text(input.card_id)) fail('invalid_schema');
  if (!optionalCount(input.time_spent_minutes)) fail('invalid_schema');
  if (input.frozen_at != null && !isIsoInstant(input.frozen_at)) fail('invalid_schema');
  if (input.arm === 'human_baseline' && input.frozen_at == null) fail('invalid_schema');
  const workspace = input.workspace ?? 'personal';
  if (!WORKSPACE.test(workspace) || (input.analyst_id != null && !isUuid(input.analyst_id))) fail('invalid_schema');
  const observationId = input.observation_id ?? null;
  if (observationId !== null && !isUuid(observationId)) fail('invalid_schema');
  return transaction(actor, async db => {
    if (!await exists(db, 'research_theses', actor.userId, input.thesis_id)) fail('scope_denied');
    if (observationId !== null) {
      const owned = (await db.query('select 1 from public.research_s4_observation_state where user_id=$1 and observation_id=$2', [actor.userId, observationId])).rowCount;
      if (owned !== 1) fail('scope_denied');
    }
    if (cited.length) {
      const found = (await db.query('select count(*) n from public.research_judgments where user_id=$1 and id=any($2::uuid[])', [actor.userId, cited])).rows[0].n;
      if (Number(found) !== cited.length) fail('scope_denied');
    }
    const id = randomUUID(), at = await serverTime(db);
    await db.query(`insert into public.research_decisions(user_id,id,thesis_id,week_of,arm,action,reason,cited_judgment_ids,card_id,time_spent_minutes,frozen_at,workspace,analyst_id,observation_id,created_at)
      values($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10,$11,$12,$13,$14,$15)`,
      [actor.userId, id, input.thesis_id, input.week_of, input.arm, input.action, input.reason, cited, input.card_id ?? null,
       input.time_spent_minutes ?? null, input.frozen_at ?? null, workspace, input.analyst_id ?? null, observationId, at]);
    await audit(db, actor, 'ledger.decision', 'research_decision', id, { thesis_id: input.thesis_id, week_of: input.week_of, arm: input.arm, action: input.action, cited_judgment_ids: cited, observation_id: observationId }, at);
    return { id, created_at: at };
  });
}

export interface OutcomeInput {
  decision_id: string;
  window_weeks: number;
  evaluation_id?: string | null;
  pillar_results?: Record<string, unknown>;
  price_result?: Record<string, unknown>;
  judged_by: string;
}

/** Append an outcome for one of this owner's decisions. */
export async function recordOutcome(actor: S4Actor, input: OutcomeInput): Promise<{ id: string; judged_at: string }> {
  if (!isUuid(input?.decision_id) || !(Number.isSafeInteger(input.window_weeks) && input.window_weeks > 0) || !text(input.judged_by)) fail('invalid_schema');
  if (input.evaluation_id != null && !text(input.evaluation_id)) fail('invalid_schema');
  const pillar = input.pillar_results ?? {}, price = input.price_result ?? {};
  if (!plainObject(pillar) || !plainObject(price)) fail('invalid_schema');
  return transaction(actor, async db => {
    if (!await exists(db, 'research_decisions', actor.userId, input.decision_id)) fail('scope_denied');
    const id = randomUUID(), at = await serverTime(db);
    await db.query(`insert into public.research_outcomes(user_id,id,decision_id,window_weeks,evaluation_id,pillar_results,price_result,judged_by,judged_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [actor.userId, id, input.decision_id, input.window_weeks, input.evaluation_id ?? null, canonicalize(pillar), canonicalize(price), input.judged_by, at]);
    await audit(db, actor, 'ledger.outcome', 'research_outcome', id, { decision_id: input.decision_id, window_weeks: input.window_weeks, evaluation_id: input.evaluation_id ?? null }, at);
    return { id, judged_at: at };
  });
}

export interface ReplayedJudgment {
  id: string; snapshot_id: string; snapshot: JudgmentSnapshot; source_id: string; thesis_id: string; run_id: string;
  question_set_version: string; question_id: string; backend: JudgmentBackend; backend_model: string;
  prompt_sha256: string | null; input_token_count: number | null; distribution: Record<string, unknown>;
  selected: string | null; confidence: number | null; abstained: boolean; latency_ms: number | null; cost_micros: number | null;
  created_at: string; available_at: string;
}

/**
 * Read-only replay for a thesis as of a decision instant: only judgments whose
 * source was available at or before as_of, ordered by content address so the
 * same ledger state always yields byte-identical output.
 */
export async function replayJudgments(actor: S4Actor, thesisId: string, asOf: string): Promise<ReplayedJudgment[]> {
  if (!isUuid(thesisId) || !isIsoInstant(asOf)) fail('invalid_schema');
  return transaction(actor, async db => {
    const rows = (await db.query(`select j.id,j.snapshot_id,j.snapshot,j.source_id,j.thesis_id,j.run_id,j.question_set_version,j.question_id,j.backend,j.backend_model,
        j.prompt_sha256,j.input_token_count,j.distribution,j.selected,j.confidence,j.abstained,j.latency_ms,j.cost_micros,j.created_at,s.available_at
      from public.research_judgments j join public.research_source_documents s on s.user_id=j.user_id and s.id=j.source_id
      where j.user_id=$1 and j.thesis_id=$2 and s.available_at<=$3::timestamptz
      order by j.snapshot_id,j.question_set_version,j.question_id,j.backend,j.backend_model,j.id`, [actor.userId, thesisId, asOf])).rows;
    return rows.map(r => ({ ...r, confidence: r.confidence === null ? null : Number(r.confidence),
      cost_micros: r.cost_micros === null ? null : Number(r.cost_micros),
      created_at: r.created_at.toISOString(), available_at: r.available_at.toISOString() }));
  });
}
