/**
 * Source ingest service (Research OS Phase 1).
 * Sources are immutable once ingested (schema trigger) and idempotent by
 * content hash: re-ingesting identical raw_text returns the existing row.
 */

import { createHash } from 'node:crypto';
import { logAudit, type ResearchDb } from './db';
import {
  SOURCE_TYPES,
  readJson,
  writeJson,
  type SourceDocument,
  type SourceType,
  type TrustLevel,
} from './types';

export interface IngestSourceInput {
  source_type: SourceType;
  title: string;
  raw_text: string;
  url?: string | null;
  author?: string | null;
  published_at?: string | null;
  trust_level?: TrustLevel;
  entity_ids?: string[];
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

function rowToSource(row: any): SourceDocument {
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
    entity_ids: readJson<string[]>(row.entity_ids, []),
  };
}

/**
 * Validate → hash → dedupe → insert + audit_log('source.ingest').
 * Idempotent: a raw_text already in the store returns {duplicate:true} with
 * the existing id and writes no new rows.
 */
export function ingestSource(db: ResearchDb, input: IngestSourceInput): IngestResult {
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

  const hash = contentHash(input.raw_text);
  const existing = db
    .prepare(`select id from source_documents where content_hash = ?`)
    .get(hash) as { id: string } | undefined;
  if (existing) return { id: existing.id, duplicate: true };

  const id = crypto.randomUUID();
  db.prepare(
    `insert into source_documents
       (id, source_type, title, url, author, published_at, ingested_at,
        raw_text, content_hash, trust_level, entity_ids)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.source_type,
    input.title.trim(),
    input.url ?? null,
    input.author ?? null,
    input.published_at ?? null,
    new Date().toISOString(),
    input.raw_text,
    hash,
    trust,
    writeJson(input.entity_ids ?? []),
  );
  logAudit(db, 'source.ingest', id, {
    source_type: input.source_type,
    title: input.title.trim(),
    content_hash: hash,
  });
  return { id, duplicate: false };
}

export function getSource(db: ResearchDb, id: string): SourceDocument | null {
  const row = db.prepare(`select * from source_documents where id = ?`).get(id);
  return row ? rowToSource(row) : null;
}

export interface ListSourcesOpts {
  type?: SourceType;
  limit?: number;
}

/** Newest-first listing, optional ?type= filter. */
export function listSources(db: ResearchDb, opts: ListSourcesOpts = {}): SourceDocument[] {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const rows = opts.type
    ? db.prepare(
        `select * from source_documents where source_type = ?
         order by ingested_at desc limit ?`,
      ).all(opts.type, limit)
    : db.prepare(
        `select * from source_documents order by ingested_at desc limit ?`,
      ).all(limit);
  return rows.map(rowToSource);
}

/** Sources whose entity_ids JSON array contains the given entity id. */
export function listSourcesForEntity(db: ResearchDb, entityId: string): SourceDocument[] {
  const rows = db.prepare(
    `select * from source_documents
     where exists (select 1 from json_each(source_documents.entity_ids) where value = ?)
     order by ingested_at desc`,
  ).all(entityId);
  return rows.map(rowToSource);
}
