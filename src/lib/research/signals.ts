/**
 * Signal extraction service (Research OS Phase 5 — Supabase Postgres).
 * pending sources → buildSignalPrompt → LLM → validateSignalDrafts
 * (anti-hallucination drops) → entity resolution → persist with metadata +
 * llm_provenance → research_audit_log('signal.extract').
 */

import { audit, isUuid, type ResearchCtx } from './store';
import { listEntities } from './entities';
import { rowToSource } from './sources';
import { defaultLlm, type LlmFn } from './memos';
import {
  buildSignalPrompt,
  validateSignalDrafts,
  type DroppedSignal,
  type SignalDraft,
} from './signal-prompt';
import {
  type Entity,
  type LlmProvenance,
  type Signal,
  type SourceDocument,
} from './types';

const TABLE = 'research_signals';
const SOURCES = 'research_source_documents';

// ---------------------------------------------------------------------------
// Row mapping + queries

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function rowToSignal(row: any): Signal {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    signal_type: row.signal_type,
    direction: row.direction,
    confidence: row.confidence,
    entity_ids: arr<string>(row.entity_ids),
    source_document_ids: arr<string>(row.source_document_ids),
    affected_company_ids: arr<string>(row.affected_company_ids),
    research_questions: arr<string>(row.research_questions),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    llm_provenance:
      row.llm_provenance && typeof row.llm_provenance === 'object'
        ? (row.llm_provenance as LlmProvenance)
        : {},
    created_at: row.created_at,
  };
}

export async function listSignals(ctx: ResearchCtx, opts: { limit?: number } = {}): Promise<Signal[]> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToSignal);
}

export async function getSignal(ctx: ResearchCtx, id: string): Promise<Signal | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSignal(data) : null;
}

/** Signals created on or after the given ISO timestamp (newest first). */
export async function listSignalsSince(ctx: ResearchCtx, sinceIso: string): Promise<Signal[]> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToSignal);
}

const PENDING_BATCH_LIMIT = 20;

/**
 * Sources not yet cited by any signal. Small data volume — the cited-id set is
 * built client-side from signals.source_document_ids (the SQLite json_each
 * anti-join equivalent). Capped at 20 per batch, oldest first.
 */
export async function listPendingSources(
  ctx: ResearchCtx,
  limit: number = PENDING_BATCH_LIMIT,
): Promise<SourceDocument[]> {
  const { data: sigRows, error: sigErr } = await ctx.supabase
    .from(TABLE)
    .select('source_document_ids')
    .eq('user_id', ctx.userId);
  if (sigErr) throw new Error(sigErr.message);
  const cited = new Set<string>(
    ((sigRows ?? []) as any[]).flatMap((r) => arr<string>(r.source_document_ids)),
  );
  const { data, error } = await ctx.supabase
    .from(SOURCES)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('ingested_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[])
    .filter((row) => !cited.has(row.id))
    .slice(0, limit)
    .map(rowToSource);
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
  ctx: ResearchCtx,
  llm: LlmFn = defaultLlm,
): Promise<ExtractSignalsResult> {
  const sources = await listPendingSources(ctx);
  if (sources.length === 0) {
    return {
      created: [], dropped: [], sourcesProcessed: 0, skippedSources: 0,
      llm: { source: 'none', message: 'no pending sources' },
    };
  }

  const entities = await listEntities(ctx);
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
  for (const draft of drafts) {
    const id = crypto.randomUUID();
    const row = draftToRow(draft, entities, companies);
    const { error } = await ctx.supabase.from(TABLE).insert({
      id,
      user_id: ctx.userId,
      title: draft.title,
      summary: draft.summary,
      signal_type: draft.signal_type,
      direction: draft.direction,
      confidence: draft.confidence,
      entity_ids: row.entity_ids,
      source_document_ids: draft.source_ids,
      affected_company_ids: row.affected_company_ids,
      research_questions: draft.research_questions,
      metadata: row.metadata,
      llm_provenance: provenance,
      created_at: now,
    });
    if (error) throw new Error(error.message);
    created.push((await getSignal(ctx, id))!);
  }

  const citedIds = new Set(created.flatMap((s) => s.source_document_ids));
  const skippedSources = sources.filter((s) => !citedIds.has(s.id)).length;

  await audit(ctx, 'signal.extract', null, {
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
