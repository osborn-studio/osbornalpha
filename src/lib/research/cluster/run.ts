/**
 * WP-A5 runners: cluster the owner's sources and align them to A2 entities.
 * Both read through the service Supabase client, write only enrichment fields
 * (cluster_id, cluster_first, entity_ids) plus alignment rows, and audit once
 * per run. Both are idempotent: a second run over the same data writes nothing.
 */
import { audit, type ResearchCtx } from '../store';
import type { SourceDocument } from '../types';
import { listSourcesSince } from '../fanout/run';
import { assignClusters, type ClusterInputSource } from './cluster';
import { decideAlignments, findCandidates, type AliasEntry } from './align';
import { listEntityKeys } from '../entity-keys/store';

const SOURCES = 'research_source_documents';
const ALIGNMENTS = 'research_source_entity_alignments';
const ENTITIES = 'research_entities';
const EPOCH = '1970-01-01T00:00:00.000Z';
const PAGE = 1000;
const IN_CHUNK = 200;

export interface RunWindow { since?: string }
export interface ClusterRunSummary { scanned: number; fresh: number; written: number; clusters: number }
export interface AlignRunSummary { scanned: number; sources_aligned: number; sources_ambiguous: number; rows_written: number; entity_ids_merged: number }

const toClusterInput = (s: SourceDocument): ClusterInputSource => ({
  id: s.id, title: s.title ?? null, url: s.url ?? null, raw_text: s.raw_text, available_at: s.available_at ?? s.ingested_at, cluster_id: s.cluster_id ?? null, cluster_first: s.cluster_first ?? null,
});

/**
 * The window (`since`) only selects which unclustered rows get assigned. Every
 * already-clustered row of the owner is loaded regardless, so first-member flags
 * are computed over complete clusters and new duplicates can join old clusters.
 */
export async function runCluster(ctx: ResearchCtx, opts: RunWindow & { jaccard?: number }): Promise<ClusterRunSummary> {
  const since = opts.since ?? EPOCH;
  const all = await listSourcesSince(ctx, EPOCH);
  const scanned = all.filter(s => s.ingested_at >= since);
  const fresh = scanned.filter(s => s.cluster_id == null).map(toClusterInput);
  const existing = all.filter(s => s.cluster_id != null).map(toClusterInput);
  const writes = assignClusters(ctx.userId, fresh, existing, { jaccard: opts.jaccard });
  for (const w of writes) {
    const { error } = await ctx.supabase.from(SOURCES).update({ cluster_id: w.cluster_id, cluster_first: w.cluster_first }).eq('user_id', ctx.userId).eq('id', w.id);
    if (error) throw new Error(error.message);
  }
  const summary = { scanned: scanned.length, fresh: fresh.length, written: writes.length, clusters: new Set(writes.map(w => w.cluster_id)).size };
  await audit(ctx, 'cluster.run', null, { ...summary, since: opts.since ?? null, jaccard: opts.jaccard ?? null });
  return summary;
}

interface EntityRow { id: string; name: string; aliases?: unknown; ticker?: string | null }
interface AliasIndex { aliases: AliasEntry[]; known: Set<string> }
/** Legacy entity rows (name, aliases, ticker) merged with A2 names, aliases and every listing code. */
async function loadAliases(ctx: ResearchCtx): Promise<AliasIndex> {
  const perEntity = new Map<string, Set<string>>();
  const add = (id: string, values: unknown[]) => {
    const set = perEntity.get(id) ?? perEntity.set(id, new Set()).get(id)!;
    for (const v of values) if (typeof v === 'string' && v.trim() !== '') set.add(v.trim());
  };
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase.from(ENTITIES).select('id, name, aliases, ticker').eq('user_id', ctx.userId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as EntityRow[];
    for (const e of page) add(e.id, [e.name, ...(Array.isArray(e.aliases) ? e.aliases : []), e.ticker]);
    if (page.length < PAGE) break;
  }
  const known = new Set(perEntity.keys());
  for (const k of await listEntityKeys(ctx)) {
    if (!known.has(k.entity_id)) continue; // alignment rows reference research_entities; an orphan key row cannot be aligned to
    add(k.entity_id, [...k.names_en, ...k.names_zh, ...k.aliases, ...k.securities.map(sec => sec.exchange_code)]);
  }
  const aliases: AliasEntry[] = [];
  for (const [entity_id, set] of perEntity) for (const alias of set) aliases.push({ entity_id, alias });
  return { aliases, known };
}

interface AlignmentRow { source_id: string; entity_id: string; status: string }
async function loadExistingAlignments(ctx: ResearchCtx, sourceIds: string[]): Promise<Map<string, AlignmentRow[]>> {
  const bySource = new Map<string, AlignmentRow[]>();
  for (let i = 0; i < sourceIds.length; i += IN_CHUNK) {
    const { data, error } = await ctx.supabase.from(ALIGNMENTS).select('source_id, entity_id, status').eq('user_id', ctx.userId).in('source_id', sourceIds.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as AlignmentRow[]) {
      const list = bySource.get(r.source_id) ?? [];
      list.push(r); bySource.set(r.source_id, list);
    }
  }
  return bySource;
}

interface AlignmentInsert { user_id: string; source_id: string; entity_id: string; method: string; status: string; confidence: number | null; evidence: Record<string, unknown>; decided_at: string; decided_by: string }

/**
 * Per source: (1) collector-provided entity_ids that point at known entities become
 * `aligned` rows with method 'collector'; (2) a source with any aligned row (old or
 * new) only gets its entity_ids reconciled with those rows — the text rule never
 * second-guesses a decision; (3) otherwise the text rule proposes aligned/ambiguous
 * rows for pairs nobody has decided yet. Every step is idempotent.
 */
export async function runAlign(ctx: ResearchCtx, opts: RunWindow): Promise<AlignRunSummary> {
  const sources = await listSourcesSince(ctx, opts.since ?? EPOCH);
  const { aliases, known } = await loadAliases(ctx);
  const existing = await loadExistingAlignments(ctx, sources.map(s => s.id));
  const summary: AlignRunSummary = { scanned: sources.length, sources_aligned: 0, sources_ambiguous: 0, rows_written: 0, entity_ids_merged: 0 };
  const now = new Date().toISOString();
  const insert = async (rows: AlignmentInsert[]) => {
    if (rows.length === 0) return;
    const { error } = await ctx.supabase.from(ALIGNMENTS).insert(rows);
    if (error) throw new Error(error.message);
    summary.rows_written += rows.length;
  };
  const reconcile = async (s: SourceDocument, alignedIds: string[]) => {
    const merged = [...new Set([...s.entity_ids, ...alignedIds])];
    if (merged.length === s.entity_ids.length) return;
    const { error } = await ctx.supabase.from(SOURCES).update({ entity_ids: merged }).eq('user_id', ctx.userId).eq('id', s.id);
    if (error) throw new Error(error.message);
    summary.entity_ids_merged++;
  };
  for (const s of sources) {
    const prior = existing.get(s.id) ?? [];
    const decided = new Set(prior.map(p => p.entity_id));
    const collector = s.entity_ids.filter(id => known.has(id) && !decided.has(id));
    await insert(collector.map(entity_id => ({ user_id: ctx.userId, source_id: s.id, entity_id, method: 'collector', status: 'aligned', confidence: 1, evidence: { source: 'entity_ids' }, decided_at: now, decided_by: 'collector' })));
    const alignedIds = [...prior.filter(p => p.status === 'aligned').map(p => p.entity_id), ...collector];
    if (alignedIds.length > 0) {
      if (collector.length > 0) summary.sources_aligned++;
      await reconcile(s, alignedIds);
      continue;
    }
    const decisions = decideAlignments(findCandidates({ title: s.title, raw_text: s.raw_text }, aliases)).filter(d => !decided.has(d.entity_id));
    if (decisions.length === 0) continue;
    await insert(decisions.map(d => ({ user_id: ctx.userId, source_id: s.id, entity_id: d.entity_id, method: d.method, status: d.status, confidence: d.confidence, evidence: d.evidence, decided_at: now, decided_by: 'rule' })));
    const aligned = decisions.filter(d => d.status === 'aligned').map(d => d.entity_id);
    if (aligned.length === 0) { summary.sources_ambiguous++; continue; }
    summary.sources_aligned++;
    await reconcile(s, aligned);
  }
  await audit(ctx, 'align.run', null, { ...summary, since: opts.since ?? null, aliases: aliases.length });
  return summary;
}
