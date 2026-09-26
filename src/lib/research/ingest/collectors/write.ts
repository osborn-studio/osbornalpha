/**
 * WP-A4 versioned ingest: one URL, many vintages. A URL whose content changed
 * gets a new row with source_version = max + 1; identical content is a
 * duplicate (content_hash dedupe in ingestSource); the old rows are kept.
 */
import { contentHash, ingestSource, type IngestResult, type IngestSourceInput } from '../../sources';
import type { ResearchCtx } from '../../store';

export interface VersionedResult extends IngestResult { source_version: string; versioned: boolean }

export async function ingestVersioned(ctx: ResearchCtx, input: Omit<IngestSourceInput, 'source_version'>): Promise<VersionedResult> {
  let version = '1', versioned = false;
  if (input.url) {
    const { data, error } = await ctx.supabase.from('research_source_documents').select('id, source_version, content_hash')
      .eq('user_id', ctx.userId).eq('url', input.url);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; source_version: string | null; content_hash: string }>;
    if (rows.length) {
      const hash = contentHash(input.raw_text);
      const same = rows.find(r => r.content_hash === hash);
      if (same) return { id: same.id, duplicate: true, source_version: same.source_version ?? '1', versioned: false };
      version = String(Math.max(...rows.map(r => Number(r.source_version ?? '1'))) + 1);
      versioned = true;
    }
  }
  const result = await ingestSource(ctx, { ...input, source_version: version });
  return { ...result, source_version: result.duplicate ? '1' : version, versioned: versioned && !result.duplicate };
}
