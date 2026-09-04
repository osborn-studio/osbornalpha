import type { PerspectiveResult } from '@/lib/data/personas';
import type { BrokerReport, Database, NewsItem, Perspective } from '@/lib/supabase/database.types';
import {
  stockNewsRows,
  stockPerspectiveRows,
  stockReportRows,
  type PerspectivePersistenceInput,
} from './research-artifacts';
import type { StockNewsResponse, StockReportsResponse } from './research-types';

// SSR and service-role clients use different Supabase generic signatures.
// This opaque boundary keeps that SDK detail out of domain services.
export type ResearchArtifactClient = object;
type PersistTable = 'news_items' | 'broker_reports' | 'perspectives';

async function upsertRows(client: ResearchArtifactClient, table: PersistTable, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const repository = client as unknown as {
    from: (name: keyof Database['public']['Tables']) => {
      upsert: (values: Array<Record<string, unknown>>, options: { onConflict: string }) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  const conflict = table === 'perspectives'
    ? 'user_id,generation_id,ticker,persona'
    : 'user_id,ticker,source_key';
  const { error } = await repository.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw new Error(`${table}_persist_failed:${error.message}`);
}

export async function persistStockNews(client: ResearchArtifactClient, userId: string, response: StockNewsResponse) {
  await upsertRows(client, 'news_items', stockNewsRows(userId, response));
}

export async function persistStockReports(client: ResearchArtifactClient, userId: string, response: StockReportsResponse) {
  await upsertRows(client, 'broker_reports', stockReportRows(userId, response));
}

export async function persistStockPerspectives(
  client: ResearchArtifactClient,
  userId: string,
  input: PerspectivePersistenceInput & { perspectives: PerspectiveResult[] },
) {
  await upsertRows(client, 'perspectives', stockPerspectiveRows(userId, input));
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

export async function loadStoredStockResearch(
  client: ResearchArtifactClient,
  userId: string,
  ticker: string,
  limit = 50,
): Promise<StoredStockResearch> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const repository = client as unknown as {
    from: (name: PersistTable) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: Record<string, unknown>) => {
              limit: (value: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const query = (table: PersistTable, orderBy: string) => repository.from(table).select('*')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .order(orderBy, { ascending: false, nullsFirst: false })
    .limit(boundedLimit);
  const [newsResult, reportResult, perspectives] = await Promise.all([
    query('news_items', 'fetched_at'),
    query('broker_reports', 'fetched_at'),
    loadLatestStockPerspectives(client, userId, ticker),
  ]);
  if (newsResult.error) throw new Error(`news_load_failed:${newsResult.error.message}`);
  if (reportResult.error) throw new Error(`reports_load_failed:${reportResult.error.message}`);
  return {
    news: (newsResult.data ?? []) as NewsItem[],
    reports: (reportResult.data ?? []) as BrokerReport[],
    perspectives,
  };
}
