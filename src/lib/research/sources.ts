/**
 * Source ingest service (Research OS Phase 5 — Supabase Postgres).
 * Sources are immutable once ingested (schema trigger) and idempotent by
 * content hash: re-ingesting identical raw_text returns the existing row
 * (unique (user_id, content_hash) → a 23505 race also resolves to duplicate).
 */

import { createHash } from 'node:crypto';
import { audit, isUuid, type ResearchCtx } from './store';
import {
  MARKETS,
  PERMISSIONS,
  SOURCE_TYPES,
  type Market,
  type Permission,
  type SourceDocument,
  type SourceType,
  type TrustLevel,
} from './types';

export function legacySourceVisible(row: any): boolean { return row?.metadata?.s4_controlled_copy !== true; }

const TABLE = 'research_source_documents';

export interface IngestSourceInput {
  source_type: SourceType;
  title: string;
  raw_text: string;
  url?: string | null;
  author?: string | null;
  published_at?: string | null;
  trust_level?: TrustLevel;
  entity_ids?: string[];
  metadata?: Record<string, unknown>;
  /** WP-A1: event date described by the document (ISO 8601). */
  event_time?: string | null;
  /** WP-A1: first instant we could obtain it; defaults to the ingestion instant. */
  available_at?: string;
  market?: Market | null;
  /** WP-A1: defaults to private for NOTE/MANUAL, public otherwise. */
  permission?: Permission;
}

export interface IngestResult {
  id: string;
  duplicate: boolean;
}

export class SourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceValidationError';
  }
}

const TRUST_LEVELS: readonly TrustLevel[] = ['LOW', 'MEDIUM', 'HIGH'] as const;

export function contentHash(rawText: string): string {
  return createHash('sha256').update(rawText, 'utf8').digest('hex');
}

/** jsonb columns come back as real values — just normalize shape. */
export function rowToSource(row: any): SourceDocument {
  return {
    id: row.id,
    source_type: row.source_type,
    title: row.title,
    url: row.url,
    author: row.author,
    published_at: row.published_at,
    ingested_at: row.ingested_at,
    raw_text: row.raw_text,
    content_hash: row.content_hash,
    trust_level: row.trust_level,
    entity_ids: Array.isArray(row.entity_ids) ? (row.entity_ids as string[]) : [],
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    // WP-A1 fields: rows from databases or mocks that predate the migration get
    // exactly the values the migration backfills.
    event_time: row.event_time ?? null,
    available_at: row.available_at ?? row.ingested_at,
    source_version: row.source_version ?? '1',
    cluster_id: row.cluster_id ?? null,
    cluster_first: row.cluster_first ?? null,
    origin_type: row.origin_type ?? null,
    market: row.market ?? null,
    permission: row.permission ?? 'public',
  };
}

const isIsoInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const defaultPermission = (type: SourceType): Permission =>
  type === 'NOTE' || type === 'MANUAL' ? 'private' : 'public';

async function findByHash(ctx: ResearchCtx, hash: string): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('content_hash', hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data.id as string) : null;
}

/**
 * Validate → hash → dedupe → insert + audit('source.ingest').
 * Idempotent: a raw_text already in the store returns {duplicate:true} with
 * the existing id and writes no new rows.
 */
export async function ingestSource(ctx: ResearchCtx, input: IngestSourceInput): Promise<IngestResult> {
  if (typeof input.raw_text !== 'string' || input.raw_text.trim() === '') {
    throw new SourceValidationError('raw_text is required and must be non-empty');
  }
  if (!SOURCE_TYPES.includes(input.source_type)) {
    throw new SourceValidationError(
      `source_type must be one of ${SOURCE_TYPES.join(', ')}`,
    );
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new SourceValidationError('title is required and must be non-empty');
  }
  const trust = input.trust_level ?? 'MEDIUM';
  if (!TRUST_LEVELS.includes(trust)) {
    throw new SourceValidationError('trust_level must be LOW | MEDIUM | HIGH');
  }
  if (input.entity_ids !== undefined && !Array.isArray(input.entity_ids)) {
    throw new SourceValidationError('entity_ids must be an array of entity ids');
  }
  if (input.event_time != null && !isIsoInstant(input.event_time)) {
    throw new SourceValidationError('event_time must be an ISO 8601 instant');
  }
  if (input.available_at !== undefined && !isIsoInstant(input.available_at)) {
    throw new SourceValidationError('available_at must be an ISO 8601 instant');
  }
  if (input.market != null && !MARKETS.includes(input.market)) {
    throw new SourceValidationError(`market must be one of ${MARKETS.join(', ')}`);
  }
  const permission = input.permission ?? defaultPermission(input.source_type);
  if (!PERMISSIONS.includes(permission)) {
    throw new SourceValidationError(`permission must be one of ${PERMISSIONS.join(', ')}`);
  }

  const hash = contentHash(input.raw_text);
  const existing = await findByHash(ctx, hash);
  if (existing) return { id: existing, duplicate: true };

  const id = crypto.randomUUID();
  const ingestedAt = new Date().toISOString();
  const { error } = await ctx.supabase.from(TABLE).insert({
    id,
    user_id: ctx.userId,
    source_type: input.source_type,
    title: input.title.trim(),
    url: input.url ?? null,
    author: input.author ?? null,
    published_at: input.published_at ?? null,
    ingested_at: ingestedAt,
    raw_text: input.raw_text,
    content_hash: hash,
    trust_level: trust,
    entity_ids: input.entity_ids ?? [],
    metadata: input.metadata ?? {},
    // WP-A1: availability defaults to this ingestion; vintage starts at 1.
    event_time: input.event_time ?? null,
    available_at: input.available_at ?? ingestedAt,
    source_version: '1',
    market: input.market ?? null,
    permission,
  });
  if (error) {
    // Unique (user_id, content_hash) race: someone inserted the same text
    // between our dedupe check and the insert — keep duplicate semantics.
    if (error.code === '23505') {
      const raced = await findByHash(ctx, hash);
      if (raced) return { id: raced, duplicate: true };
    }
    throw new Error(error.message);
  }
  await audit(ctx, 'source.ingest', id, {
    source_type: input.source_type,
    title: input.title.trim(),
    content_hash: hash,
  });
  return { id, duplicate: false };
}

export async function getSource(ctx: ResearchCtx, id: string): Promise<SourceDocument | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data && legacySourceVisible(data) ? rowToSource(data) : null;
}

export interface ListSourcesOpts {
  type?: SourceType;
  limit?: number;
}

/** Newest-first listing, optional ?type= filter. */
export async function listSources(ctx: ResearchCtx, opts: ListSourcesOpts = {}): Promise<SourceDocument[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  let q = ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('ingested_at', { ascending: false })
    .limit(limit);
  if (opts.type) q = q.eq('source_type', opts.type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(legacySourceVisible).map(rowToSource);
}

/** Sources whose entity_ids jsonb array contains the given entity id. */
export async function listSourcesForEntity(ctx: ResearchCtx, entityId: string): Promise<SourceDocument[]> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .contains('entity_ids', [entityId])
    .order('ingested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(legacySourceVisible).map(rowToSource);
}

/** Fetch a set of sources by id (skips non-uuid junk and missing rows). */
export async function listSourcesByIds(ctx: ResearchCtx, ids: string[]): Promise<SourceDocument[]> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return [];
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .in('id', valid);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(legacySourceVisible).map(rowToSource);
}
