/**
 * company-diligence brief → Research OS source (Phase: diligence loop).
 * Spec: docs/research-os/2026-07-05-diligence-to-research-loop-spec.md
 *
 * A diligence brief is a SOURCE, not a memo (it has no verdict). It lands as
 * one immutable research_source_documents row (source_type='NOTE' +
 * metadata.kind='diligence'), version-chained per (user, ticker). Re-running
 * appends a new version (sources are immutable); the newest supersedes the
 * prior. The closing JSON's unverified[] is archived so the brain always knows
 * what still needs external verification.
 */

import { audit, type ResearchCtx } from './store';
import { upsertEntity } from './entities';
import { ingestSource, contentHash, listSources, type IngestResult } from './sources';

export interface IngestDiligenceInput {
  ticker: string;
  canonical_name?: string | null;
  one_line?: string | null;
  unverified?: string[];
  markdown: string;
  tool_refs?: string[];
  provenance?: { model?: string; generated_at?: string };
}

export interface DiligenceResult extends IngestResult {
  version: number;
  entity_id: string;
}

/**
 * Prior diligence sources for this ticker, newest-first. Filters NOTE sources
 * by metadata in JS rather than a jsonb `contains`/`->>'` query — PostgREST
 * mishandles `.contains` on the jsonb entity_ids column, and the JS path works
 * against both the real DB and the test mock. The owner's source count is small.
 */
async function priorDiligence(ctx: ResearchCtx, ticker: string) {
  const all = await listSources(ctx, { type: 'NOTE', limit: 1000 });
  return all.filter(
    (s) => (s.metadata as any)?.kind === 'diligence' && (s.metadata as any)?.ticker === ticker,
  );
}

/**
 * Store a company-diligence brief as a versioned research source.
 * Idempotent: re-storing the identical brief text returns the existing row
 * with its original version (no new version is minted).
 */
export async function ingestDiligence(ctx: ResearchCtx, input: IngestDiligenceInput): Promise<DiligenceResult> {
  const ticker = (input.ticker ?? '').trim();
  if (!ticker) throw new Error('ticker is required');
  if (typeof input.markdown !== 'string' || input.markdown.trim() === '') {
    throw new Error('markdown is required and must be non-empty');
  }
  const name = (input.canonical_name || ticker).trim();

  const entity_id = await upsertEntity(ctx, { type: 'COMPANY', name, ticker });
  const prior = await priorDiligence(ctx, ticker);

  // Exact same brief already stored → return its version, mint nothing new.
  const hash = contentHash(input.markdown);
  const dup = prior.find((s) => s.content_hash === hash);
  if (dup) {
    return { id: dup.id, duplicate: true, version: Number((dup.metadata as any)?.version) || 1, entity_id };
  }

  const version = prior.length + 1;
  const supersedes = prior[0]?.id ?? null; // listSourcesForEntity is newest-first

  const result = await ingestSource(ctx, {
    source_type: 'NOTE',
    title: `尽调简报：${name}（${ticker}）`,
    raw_text: input.markdown,
    trust_level: 'MEDIUM',
    entity_ids: [entity_id],
    metadata: {
      kind: 'diligence',
      method: 'company-diligence',
      ticker,
      canonical_name: input.canonical_name ?? null,
      one_line: input.one_line ?? null,
      unverified: input.unverified ?? [],
      version,
      supersedes,
      provenance: input.provenance ?? {},
      tool_refs: input.tool_refs ?? [],
    },
  });

  await audit(ctx, 'source.ingest_diligence', result.id, { ticker, version, duplicate: result.duplicate });
  return { ...result, version, entity_id };
}
