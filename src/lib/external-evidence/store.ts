import { createHash } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EvidenceSearchSnapshot, NormalizedEvidenceSearchRequest } from './types';

function requestHash(request: NormalizedEvidenceSearchRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

export function buildEvidencePersistenceRows(
  request: NormalizedEvidenceSearchRequest,
  snapshot: EvidenceSearchSnapshot,
) {
  const expiresAt = new Date(Date.parse(snapshot.fetchedAt) + 6 * 60 * 60_000).toISOString();
  return {
    run: {
      request_id: snapshot.requestId,
      request_hash: requestHash(request),
      ticker: request.ticker ?? null,
      scopes: request.scopes,
      provider: snapshot.provider,
      status: snapshot.status,
      query_count: snapshot.queryCount,
      result_count: snapshot.results.length,
      duration_ms: snapshot.durationMs,
      estimated_cost_microusd: snapshot.estimatedCostMicrousd,
      warnings: snapshot.warnings,
      created_at: snapshot.fetchedAt,
    },
    evidence: snapshot.results.map((item) => ({
      citation_id: item.citationId,
      canonical_url: item.url,
      title: item.title,
      domain: item.domain,
      snippet: item.snippet,
      source_type: item.sourceType,
      published_at: item.publishedAt,
      fetched_at: item.fetchedAt,
      provider: snapshot.provider,
      trust_score: item.trustScore,
      relevance_score: item.relevanceScore,
      quality_score: item.qualityScore,
      quality_flags: item.qualityFlags,
      content_hash: createHash('sha256').update(`${item.title}\n${item.snippet}`).digest('hex'),
    })),
    links: request.ticker ? snapshot.results.map((item) => ({
      ticker: request.ticker!,
      citation_id: item.citationId,
      request_id: snapshot.requestId,
      expires_at: expiresAt,
    })) : [],
  };
}

export async function persistEvidenceSnapshot(
  request: NormalizedEvidenceSearchRequest,
  snapshot: EvidenceSearchSnapshot,
): Promise<void> {
  type EvidenceTable = 'external_evidence_runs' | 'external_evidence' | 'external_evidence_tickers';
  type EvidenceRepository = {
    from: (table: EvidenceTable) => {
      upsert: (
        values: Record<string, unknown> | Array<Record<string, unknown>>,
        options: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  // Keep the SDK generic at this trusted service-role boundary while retaining
  // a small, explicit table contract for the persistence operations below.
  const db = getAdminSupabase() as unknown as EvidenceRepository;
  const rows = buildEvidencePersistenceRows(request, snapshot);
  const { error: runError } = await db.from('external_evidence_runs').upsert(rows.run, { onConflict: 'request_id' });
  if (runError) throw new Error('evidence_run_persist_failed');
  if (rows.evidence.length === 0) return;
  const { error: evidenceError } = await db.from('external_evidence').upsert(rows.evidence, { onConflict: 'citation_id' });
  if (evidenceError) throw new Error('evidence_persist_failed');
  if (rows.links.length > 0) {
    const { error: linkError } = await db.from('external_evidence_tickers').upsert(rows.links, { onConflict: 'ticker,citation_id,request_id' });
    if (linkError) throw new Error('evidence_link_persist_failed');
  }
}
