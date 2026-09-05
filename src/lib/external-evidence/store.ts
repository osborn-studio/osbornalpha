import { createHash } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { buildEvidenceQueries } from './query';
import type { EvidenceSearchSnapshot, NormalizedEvidenceSearchRequest } from './types';

const EVIDENCE_AUDIT_VERSION = 1;

function requestHash(request: NormalizedEvidenceSearchRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function queryPlan(request: NormalizedEvidenceSearchRequest) {
  return buildEvidenceQueries(request).map((query) => ({
    scope: query.scope,
    queryHash: sha256(query.query),
    freshnessDays: query.freshnessDays,
    limit: query.limit,
  }));
}

function resultSet(snapshot: EvidenceSearchSnapshot) {
  const rows = snapshot.results
    .map((item) => ({
      citationId: item.citationId,
      contentHash: item.document?.contentHash ?? sha256(`${item.title}\n${item.snippet}`),
    }))
    .sort((left, right) => left.citationId.localeCompare(right.citationId));
  return {
    citationIds: rows.map((row) => row.citationId),
    hash: sha256(JSON.stringify(rows)),
  };
}

export function buildEvidencePersistenceRows(
  request: NormalizedEvidenceSearchRequest,
  snapshot: EvidenceSearchSnapshot,
) {
  const expiresAt = new Date(Date.parse(snapshot.fetchedAt) + 6 * 60 * 60_000).toISOString();
  const results = resultSet(snapshot);
  return {
    run: {
      request_id: snapshot.requestId,
      request_hash: requestHash(request),
      audit_version: EVIDENCE_AUDIT_VERSION,
      query_plan: queryPlan(request),
      result_citation_ids: results.citationIds,
      result_set_hash: results.hash,
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
      event_cluster_id: item.eventClusterId ?? item.citationId,
      corroboration_count: item.corroborationCount ?? 1,
      corroborating_sources: item.corroboratingSources ?? [],
      content_hash: sha256(`${item.title}\n${item.snippet}`),
      document_content_hash: item.document?.contentHash ?? null,
      document_fetched_at: item.document?.fetchedAt ?? null,
      document_paragraphs: item.document?.paragraphs ?? [],
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
      insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
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
  // Runs form an immutable audit ledger. Evidence bodies remain independently
  // upserted by citation so cached public facts can receive fresher metadata.
  const { error: runError } = await db.from('external_evidence_runs').insert(rows.run);
  if (runError) throw new Error('evidence_run_persist_failed');
  if (rows.evidence.length === 0) return;
  const { error: evidenceError } = await db.from('external_evidence').upsert(rows.evidence, { onConflict: 'citation_id' });
  if (evidenceError) throw new Error('evidence_persist_failed');
  if (rows.links.length > 0) {
    const { error: linkError } = await db.from('external_evidence_tickers').upsert(rows.links, { onConflict: 'ticker,citation_id,request_id' });
    if (linkError) throw new Error('evidence_link_persist_failed');
  }
}
