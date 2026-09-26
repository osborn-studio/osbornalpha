/**
 * WP-A3 judgment ledger (implementation plan 2026-09-22 §5.4/§5.5).
 * Judgments are pure derivations addressed by their inputs; decisions and
 * outcomes are human events. All four tables are append-only (database
 * trigger) and every write here runs inside the S4 owner transaction.
 */
import { canonicalize, digest, fail } from '../ingest/pa-v1/json.js';

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

