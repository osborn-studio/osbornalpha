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
export function snapshotId(snapshot: JudgmentSnapshot): string {
  if (!isUuid(snapshot?.source_id) || !isUuid(snapshot?.thesis_id)) fail('invalid_schema');
  for (const k of ['source_version','thesis_version','entity_table_version'] as const) if (!text(snapshot[k])) fail('invalid_schema');
  return digest({ source_id: snapshot.source_id, source_version: snapshot.source_version, thesis_id: snapshot.thesis_id,
    thesis_version: snapshot.thesis_version, entity_table_version: snapshot.entity_table_version });
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
  return canonicalize({ snapshot: { source_id: input.snapshot.source_id, source_version: input.snapshot.source_version, thesis_id: input.snapshot.thesis_id,
    thesis_version: input.snapshot.thesis_version, entity_table_version: input.snapshot.entity_table_version },
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
      [actor.userId, id, snapshot_id, canonicalize(input.snapshot), input.snapshot.source_id, input.snapshot.thesis_id, input.run_id,
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
