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
  id: s.id, title: s.title, url: s.url, raw_text: s.raw_text, available_at: s.available_at, cluster_id: s.cluster_id, cluster_first: s.cluster_first,
});

export async function runCluster(ctx: ResearchCtx, opts: RunWindow & { jaccard?: number }): Promise<ClusterRunSummary> {
  const sources = await listSourcesSince(ctx, opts.since ?? EPOCH);
  const fresh = sources.filter(s => s.cluster_id === null).map(toClusterInput);
  const existing = sources.filter(s => s.cluster_id !== null).map(toClusterInput);
  const writes = assignClusters(ctx.userId, fresh, existing, { jaccard: opts.jaccard });
  for (const w of writes) {
    const { error } = await ctx.supabase.from(SOURCES).update({ cluster_id: w.cluster_id, cluster_first: w.cluster_first }).eq('user_id', ctx.userId).eq('id', w.id);
    if (error) throw new Error(error.message);
  }
  const summary = { scanned: sources.length, fresh: fresh.length, written: writes.length, clusters: new Set(writes.map(w => w.cluster_id)).size };
  await audit(ctx, 'cluster.run', null, { ...summary, since: opts.since ?? null, jaccard: opts.jaccard ?? null });
  return summary;
}

interface EntityRow { id: string; name: string; aliases?: unknown; ticker?: string | null }
async function loadAliases(ctx: ResearchCtx): Promise<AliasEntry[]> {
  const out: AliasEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase.from(ENTITIES).select('id, name, aliases, ticker').eq('user_id', ctx.userId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as EntityRow[];
    for (const e of page) {
      const names = [e.name, ...(Array.isArray(e.aliases) ? e.aliases : []), e.ticker].filter((a): a is string => typeof a === 'string' && a.trim() !== '');
      for (const alias of new Set(names)) out.push({ entity_id: e.id, alias });
    }
    if (page.length < PAGE) return out;
  }
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

export async function runAlign(ctx: ResearchCtx, opts: RunWindow): Promise<AlignRunSummary> {
  const sources = await listSourcesSince(ctx, opts.since ?? EPOCH);
  const aliases = await loadAliases(ctx);
  const existing = await loadExistingAlignments(ctx, sources.map(s => s.id));
  const summary: AlignRunSummary = { scanned: sources.length, sources_aligned: 0, sources_ambiguous: 0, rows_written: 0, entity_ids_merged: 0 };
  const now = new Date().toISOString();
  for (const s of sources) {
    const prior = existing.get(s.id) ?? [];
    if (prior.some(p => p.status === 'aligned')) continue;
    const decided = new Set(prior.map(p => p.entity_id));
    // Pairs already decided (by anyone) are never re-proposed; the rule only fills gaps.
    const decisions = decideAlignments(findCandidates({ title: s.title, raw_text: s.raw_text }, aliases)).filter(d => !decided.has(d.entity_id));
    if (decisions.length === 0) continue;
    const { error } = await ctx.supabase.from(ALIGNMENTS).insert(decisions.map(d => ({
      user_id: ctx.userId, source_id: s.id, entity_id: d.entity_id, method: d.method, status: d.status,
      confidence: d.confidence, evidence: d.evidence, decided_at: now, decided_by: 'rule',
    })));
    if (error) throw new Error(error.message);
    summary.rows_written += decisions.length;
    const aligned = decisions.filter(d => d.status === 'aligned');
    if (aligned.length === 0) { summary.sources_ambiguous++; continue; }
    summary.sources_aligned++;
    const merged = [...new Set([...s.entity_ids, ...aligned.map(d => d.entity_id)])];
    if (merged.length !== s.entity_ids.length) {
      const { error: updateError } = await ctx.supabase.from(SOURCES).update({ entity_ids: merged }).eq('user_id', ctx.userId).eq('id', s.id);
      if (updateError) throw new Error(updateError.message);
      summary.entity_ids_merged++;
    }
  }
  await audit(ctx, 'align.run', null, { ...summary, since: opts.since ?? null, aliases: aliases.length });
  return summary;
}
