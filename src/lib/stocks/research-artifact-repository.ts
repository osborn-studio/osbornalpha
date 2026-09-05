import type { PerspectiveResult } from '@/lib/data/personas';
import type { BrokerReport, Database, NewsItem, Perspective } from '@/lib/supabase/database.types';
import {
  stockNewsArtifactRows,
  stockPerspectiveRows,
  stockReportArtifactRows,
  type SharedResearchArtifactRow,
  type PerspectivePersistenceInput,
} from './research-artifacts';
import type { StockNewsResponse, StockReportsResponse } from './research-types';

// SSR and service-role clients use different Supabase generic signatures.
// This opaque boundary keeps that SDK detail out of domain services.
export type ResearchArtifactClient = object;
type PersistTable = 'perspectives';

async function upsertPerspectiveRows(client: ResearchArtifactClient, rows: Array<Record<string, unknown>>): Promise<Perspective[]> {
  if (rows.length === 0) return [];
  const repository = client as unknown as {
    from: (name: keyof Database['public']['Tables']) => {
      upsert: (values: Array<Record<string, unknown>>, options: { onConflict: string }) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  const { error } = await repository.from('perspectives').upsert(rows, { onConflict: 'user_id,generation_id,ticker,persona' });
  if (error) throw new Error(`perspectives_persist_failed:${error.message}`);
  // Perspective ids are deterministic, so callers can expose them without a
  // second query while the database remains the ownership authority.
  return rows as unknown as Perspective[];
}

async function persistSharedArtifacts(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
  kind: SharedResearchArtifactRow['kind'],
  rows: SharedResearchArtifactRow[],
) {
  const repository = client as unknown as {
    rpc: (name: 'persist_shared_research_artifacts', args: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
  const { error } = await repository.rpc('persist_shared_research_artifacts', {
    p_user_id: userId,
    p_ticker: ticker,
    p_kind: kind,
    p_rows: rows,
  });
  if (error) throw new Error(`${kind}_artifacts_persist_failed:${error.message}`);
}

export async function persistStockNews(client: ResearchArtifactClient, userId: string, response: StockNewsResponse) {
  await persistSharedArtifacts(client, userId, response.ticker, 'news', stockNewsArtifactRows(response));
}

export async function persistStockReports(client: ResearchArtifactClient, userId: string, response: StockReportsResponse) {
  await persistSharedArtifacts(client, userId, response.ticker, 'report', stockReportArtifactRows(response));
}

export async function persistStockPerspectives(
  client: ResearchArtifactClient,
  userId: string,
  input: PerspectivePersistenceInput & { perspectives: PerspectiveResult[] },
) {
  return upsertPerspectiveRows(client, stockPerspectiveRows(userId, input));
}

export async function loadLatestStockPerspectives(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
): Promise<Perspective[]> {
  type PerspectiveQuery = {
    eq: (column: 'user_id' | 'ticker', value: string) => PerspectiveQuery;
    order: (column: 'created_at', options: { ascending: boolean }) => PerspectiveQuery;
    limit: (value: number) => Promise<{ data: Perspective[] | null; error: { message: string } | null }>;
  };
  const repository = client as unknown as {
    from: (name: 'perspectives') => {
      select: (columns: string) => PerspectiveQuery;
  };
  };
  const query = repository.from('perspectives').select('*').eq('user_id', userId).eq('ticker', ticker)
    .order('created_at', { ascending: false }).limit(100);
  const { data, error } = await query;
  if (error) throw new Error(`perspectives_load_failed:${error.message}`);
  const rows = data ?? [];
  const latest = rows[0];
  if (!latest) return [];
  return rows.filter((row) => latest.generation_id
    ? row.generation_id === latest.generation_id
    : row.brief_id === latest.brief_id);
}

export interface StoredStockResearch {
  news: NewsItem[];
  reports: BrokerReport[];
  perspectives: Perspective[];
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sharedNewsRow(userId: string, row: SharedResearchArtifactRow): NewsItem {
  const payload = payloadRecord(row.payload);
  return {
    id: row.id,
    user_id: userId,
    ticker: row.ticker,
    source_key: row.source_key,
    title: row.title,
    source: row.source,
    url: row.url,
    snippet: optionalString(payload.snippet),
    sentiment: optionalNumber(payload.sentiment),
    sentiment_confidence: optionalNumber(payload.sentiment_confidence) ?? 0,
    sentiment_language: optionalString(payload.sentiment_language) ?? 'unknown',
    sentiment_aspects: payloadRecord(payload.sentiment_aspects) as NewsItem['sentiment_aspects'],
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    trust_score: optionalNumber(payload.trust_score),
    relevance_score: optionalNumber(payload.relevance_score),
    quality_score: row.quality_score,
    quality_flags: stringList(payload.quality_flags),
    event_cluster_id: row.event_cluster_id,
    corroboration_count: optionalNumber(payload.corroboration_count) ?? 1,
    corroborating_sources: Array.isArray(payload.corroborating_sources)
      ? payload.corroborating_sources as NewsItem['corroborating_sources']
      : [],
    source_type: optionalString(payload.source_type),
  };
}

function sharedReportRow(userId: string, row: SharedResearchArtifactRow): BrokerReport {
  const payload = payloadRecord(row.payload);
  return {
    id: row.id,
    user_id: userId,
    ticker: row.ticker,
    source_key: row.source_key,
    title: row.title,
    broker: optionalString(payload.broker),
    rating: optionalString(payload.rating),
    target_price: optionalString(payload.target_price),
    target_change_pct: optionalNumber(payload.target_change_pct),
    pdf_url: row.url,
    ai_summary: optionalString(payload.ai_summary),
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    source: row.source,
    trust_score: optionalNumber(payload.trust_score),
    relevance_score: optionalNumber(payload.relevance_score),
    quality_score: row.quality_score,
    quality_flags: stringList(payload.quality_flags),
    event_cluster_id: row.event_cluster_id,
    corroboration_count: optionalNumber(payload.corroboration_count) ?? 1,
    corroborating_sources: Array.isArray(payload.corroborating_sources)
      ? payload.corroborating_sources as BrokerReport['corroborating_sources']
      : [],
  };
}

export async function loadStoredStockResearch(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
  limit = 50,
): Promise<StoredStockResearch> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const repository = client as unknown as {
    rpc: (name: 'load_watchlist_research_artifacts', args: Record<string, unknown>) => Promise<{
      data: SharedResearchArtifactRow[] | null;
      error: { message: string } | null;
    }>;
  };
  const [artifactResult, perspectives] = await Promise.all([
    repository.rpc('load_watchlist_research_artifacts', {
      p_user_id: userId,
      p_ticker: ticker,
      p_limit: boundedLimit,
    }),
    loadLatestStockPerspectives(client, userId, ticker),
  ]);
  if (artifactResult.error) throw new Error(`research_artifacts_load_failed:${artifactResult.error.message}`);
  const artifacts = artifactResult.data ?? [];
  return {
    news: artifacts.filter((row) => row.kind === 'news').map((row) => sharedNewsRow(userId, row)),
    reports: artifacts.filter((row) => row.kind === 'report').map((row) => sharedReportRow(userId, row)),
    perspectives,
  };
}
