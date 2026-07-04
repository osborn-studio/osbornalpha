/**
 * Signal extraction service (Research OS Phase 2).
 * pending sources → buildSignalPrompt → LLM → validateSignalDrafts
 * (anti-hallucination drops) → entity resolution → persist with metadata +
 * llm_provenance → audit_log('signal.extract').
 */

import { logAudit, type ResearchDb } from './db';
import { listEntities } from './entities';
import { defaultLlm, type LlmFn } from './memos';
import {
  buildSignalPrompt,
  validateSignalDrafts,
  type DroppedSignal,
  type SignalDraft,
} from './signal-prompt';
import {
  readJson,
  writeJson,
  type Entity,
  type LlmProvenance,
  type Signal,
  type SourceDocument,
} from './types';

// ---------------------------------------------------------------------------
// Row mapping + queries

function rowToSignal(row: any): Signal {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    signal_type: row.signal_type,
    direction: row.direction,
    confidence: row.confidence,
    entity_ids: readJson<string[]>(row.entity_ids, []),
    source_document_ids: readJson<string[]>(row.source_document_ids, []),
    affected_company_ids: readJson<string[]>(row.affected_company_ids, []),
    research_questions: readJson<string[]>(row.research_questions, []),
    metadata: readJson<Record<string, unknown>>(row.metadata, {}),
    llm_provenance: readJson<LlmProvenance>(row.llm_provenance, {}),
    created_at: row.created_at,
  };
}

export function listSignals(db: ResearchDb, opts: { limit?: number } = {}): Signal[] {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  return db
    .prepare(`select * from signals order by created_at desc limit ?`)
    .all(limit)
    .map(rowToSignal);
}

export function getSignal(db: ResearchDb, id: string): Signal | null {
  const row = db.prepare(`select * from signals where id = ?`).get(id);
  return row ? rowToSignal(row) : null;
}

/** Signals created on or after the given ISO timestamp (newest first). */
export function listSignalsSince(db: ResearchDb, sinceIso: string): Signal[] {
  return db
    .prepare(`select * from signals where created_at >= ? order by created_at desc`)
    .all(sinceIso)
    .map(rowToSignal);
}

const PENDING_BATCH_LIMIT = 20;

/**
 * Sources not yet cited by any signal (small data volume — the json_each
 * anti-join from the plan is plenty). Capped at 20 per batch.
 */
export function listPendingSources(
  db: ResearchDb,
  limit: number = PENDING_BATCH_LIMIT,
): SourceDocument[] {
  const rows: any[] = db
    .prepare(
      `select * from source_documents
       where id not in (select je.value from signals s, json_each(s.source_document_ids) je)
       order by ingested_at asc
       limit ?`,
    )
    .all(limit);
  return rows.map((row) => ({
    ...row,
    entity_ids: readJson<string[]>(row.entity_ids, []),
  })) as SourceDocument[];
}

// ---------------------------------------------------------------------------
// Entity resolution

export interface ResolveResult {
  ids: string[];
  unmatched: string[];
}

/**
 * Resolve LLM-produced entity names to seeded entity ids by case-insensitive
 * name/alias match. Unmatched names are returned (→ signal.metadata) — never
 * invented.
 */
export function resolveEntityNames(names: string[], entities: Entity[]): ResolveResult {
  const index = new Map<string, string>();
  for (const e of entities) {
    index.set(e.name.toLowerCase(), e.id);
    for (const alias of e.aliases) index.set(alias.toLowerCase(), e.id);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const unmatched: string[] = [];
  for (const name of names) {
    const id = index.get(name.trim().toLowerCase());
    if (!id) {
      unmatched.push(name);
    } else if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids, unmatched };
}

// ---------------------------------------------------------------------------
// Extraction

export interface ExtractSignalsResult {
  created: Signal[];
  dropped: DroppedSignal[];
  /** Sources in this batch. */
  sourcesProcessed: number;
  /** Batch sources not cited by any created signal (no research value / retried next run). */
  skippedSources: number;
  llm:
    | { source: 'llm'; model: string }
    | { source: 'none' | 'no-key' | 'error'; message: string };
}

/**
 * Extract signals from the pending source batch via the shared LLM stack.
 * Provider failure returns a structured result — never throws for LLM
 * problems (Phase 1 convention).
 */
export async function extractSignals(
  db: ResearchDb,
  llm: LlmFn = defaultLlm,
): Promise<ExtractSignalsResult> {
  const sources = listPendingSources(db);
  if (sources.length === 0) {
    return {
      created: [], dropped: [], sourcesProcessed: 0, skippedSources: 0,
      llm: { source: 'none', message: 'no pending sources' },
    };
  }

  const entities = listEntities(db);
  const prompt = buildSignalPrompt(sources, entities);

  let content: string;
  let model: string;
  try {
    const r = await llm({ system: prompt.system, user: prompt.user });
    content = r.content;
    model = r.model;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const noKey = /no llm provider configured/i.test(message);
    return {
      created: [], dropped: [], sourcesProcessed: sources.length,
      skippedSources: sources.length,
      llm: { source: noKey ? 'no-key' : 'error', message },
    };
  }

  const { extractJson } = await import('@/lib/data/sources/llm');
  const parsed = extractJson(content);
  if (!parsed) {
    return {
      created: [], dropped: [], sourcesProcessed: sources.length,
      skippedSources: sources.length,
      llm: { source: 'error', message: 'LLM output was not parseable JSON' },
    };
  }

  const { drafts, dropped } = validateSignalDrafts(parsed, prompt.source_document_ids);
  const companies = entities.filter((e) => e.type === 'COMPANY');
  const now = new Date().toISOString();
  const provenance: LlmProvenance = {
    model,
    prompt_sha256: prompt.prompt_sha256,
    generated_at: now,
  };

  const created: Signal[] = [];
  const insert = db.prepare(
    `insert into signals
       (id, title, summary, signal_type, direction, confidence, entity_ids,
        source_document_ids, affected_company_ids, research_questions,
        metadata, llm_provenance, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const draft of drafts) {
    const id = crypto.randomUUID();
    const row = draftToRow(draft, entities, companies);
    insert.run(
      id,
      draft.title,
      draft.summary,
      draft.signal_type,
      draft.direction,
      draft.confidence,
      writeJson(row.entity_ids),
      writeJson(draft.source_ids),
      writeJson(row.affected_company_ids),
      writeJson(draft.research_questions),
      writeJson(row.metadata),
      writeJson(provenance),
      now,
    );
    created.push(getSignal(db, id)!);
  }

  const citedIds = new Set(created.flatMap((s) => s.source_document_ids));
  const skippedSources = sources.filter((s: any) => !citedIds.has(s.id)).length;

  logAudit(db, 'signal.extract', null, {
    created: created.length,
    created_ids: created.map((s) => s.id),
    dropped,
    skipped_sources: skippedSources,
    sources_processed: sources.length,
    model,
    prompt_sha256: prompt.prompt_sha256,
  });

  return {
    created,
    dropped,
    sourcesProcessed: sources.length,
    skippedSources,
    llm: { source: 'llm', model },
  };
}

function draftToRow(draft: SignalDraft, entities: Entity[], companies: Entity[]) {
  const resolved = resolveEntityNames(draft.entity_names, entities);
  const affected = resolveEntityNames(draft.affected_company_names, companies);
  const metadata: Record<string, unknown> = {};
  if (resolved.unmatched.length) metadata.unmatched_names = resolved.unmatched;
  if (affected.unmatched.length) metadata.unmatched_company_names = affected.unmatched;
  return {
    entity_ids: resolved.ids,
    affected_company_ids: affected.ids,
    metadata,
  };
}
