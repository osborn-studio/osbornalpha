import type { getServerSupabase } from '@/lib/supabase/server';
import type { WatchlistDecisionPatch } from './decision';
import type { WatchlistItem, WatchlistItemDecisionHistory } from '@/lib/supabase/database.types';
import { serverToGroups, type ServerWatchlistRow, type VersionedWatchlistSnapshot } from './sync';
import type {
  WatchlistOverviewDatabasePage,
  WatchlistOverviewGroupRow,
  WatchlistOverviewItemRow,
  WatchlistOverviewPageRow,
} from './overview-contract';
export type { WatchlistOverviewItemRow, WatchlistOverviewGroupRow } from './overview-contract';

export type WatchlistServerClient = Awaited<ReturnType<typeof getServerSupabase>>;

const STRUCTURE_SELECT = 'id, name, sort_order, watchlist_items (ticker, sort_order)';
const OVERVIEW_SELECT = `
  id, name, description, sort_order,
  watchlist_items (
    id, ticker, conviction, notes, sort_order, added_at, thesis, target_price,
    invalidation_conditions, confidence, review_at, tags, status, updated_at,
    decision_version
  )
`;

export async function loadWatchlistRows(client: WatchlistServerClient): Promise<ServerWatchlistRow[]> {
  const { data, error } = await client.from('watchlists').select(STRUCTURE_SELECT).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServerWatchlistRow[];
}

export async function loadWatchlistOverviewRows(client: WatchlistServerClient): Promise<WatchlistOverviewGroupRow[]> {
  const { data, error } = await client.from('watchlists').select(OVERVIEW_SELECT).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WatchlistOverviewGroupRow[];
}

function parseOverviewPage(value: unknown): WatchlistOverviewDatabasePage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_watchlist_overview_page');
  const page = value as Record<string, unknown>;
  if (!Number.isSafeInteger(page.total) || Number(page.total) < 0 || !Array.isArray(page.rows)) {
    throw new Error('invalid_watchlist_overview_page');
  }
  const rows: WatchlistOverviewPageRow[] = page.rows.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('invalid_watchlist_overview_row');
    const row = candidate as Record<string, unknown>;
    if (!row.group || typeof row.group !== 'object' || Array.isArray(row.group)
      || !row.item || typeof row.item !== 'object' || Array.isArray(row.item)) {
      throw new Error('invalid_watchlist_overview_row');
    }
    const group = row.group as Record<string, unknown>;
    const item = row.item as Record<string, unknown>;
    if (typeof group.id !== 'string' || typeof group.name !== 'string' || !Number.isInteger(group.sort_order)
      || typeof item.id !== 'string' || typeof item.ticker !== 'string' || !Number.isInteger(item.sort_order)) {
      throw new Error('invalid_watchlist_overview_row');
    }
    return {
      group: group as unknown as WatchlistOverviewPageRow['group'],
      item: item as unknown as WatchlistOverviewItemRow,
    };
  });
  return { total: Number(page.total), rows };
}

export async function loadWatchlistOverviewPage(
  client: WatchlistServerClient,
  request: { offset: number; limit: number; ticker?: string | null },
): Promise<WatchlistOverviewDatabasePage> {
  const repository = client as unknown as {
    rpc: (name: 'get_watchlist_overview_page', args: {
      p_offset: number;
      p_limit: number;
      p_ticker: string | null;
    }) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_overview_page', {
    p_offset: request.offset,
    p_limit: request.limit,
    p_ticker: request.ticker ?? null,
  });
  if (error) throw new Error(error.message);
  return parseOverviewPage(data);
}

export async function loadWatchlistVersion(client: WatchlistServerClient): Promise<number> {
  const { data, error } = await client.from('watchlist_sync_state').select('version').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as { version: number } | null)?.version ?? 0;
}

export async function loadVersionedWatchlistSnapshot(
  client: WatchlistServerClient,
  ownerId: string,
): Promise<VersionedWatchlistSnapshot> {
  const [rows, version] = await Promise.all([
    loadWatchlistRows(client),
    loadWatchlistVersion(client),
  ]);
  return { ownerId, version, groups: serverToGroups(rows) };
}

export async function updateWatchlistItemDecision(
  client: WatchlistServerClient,
  itemId: string,
  patch: WatchlistDecisionPatch,
  expectedVersion: number,
) {
  const repository = client as unknown as {
    rpc: (name: 'update_watchlist_item_decision', args: {
      p_item_id: string;
      p_expected_version: number;
      p_patch: WatchlistDecisionPatch;
    }) => Promise<{ data: WatchlistItem[] | null; error: { code?: string; message: string } | null }>;
  };
  const { data, error } = await repository.rpc('update_watchlist_item_decision', {
    p_item_id: itemId,
    p_expected_version: expectedVersion,
    p_patch: patch,
  });
  return { data: data?.[0] ?? null, error };
}

export async function loadWatchlistItem(client: WatchlistServerClient, userId: string, itemId: string) {
  const result = await client.from('watchlist_items').select('*')
    .eq('id', itemId).eq('user_id', userId).maybeSingle();
  return result as { data: WatchlistItem | null; error: { message: string } | null };
}

export async function upsertWatchlistItem(
  client: WatchlistServerClient,
  item: Pick<WatchlistItem, 'watchlist_id' | 'ticker' | 'conviction' | 'sort_order' | 'user_id'>,
) {
  const repository = client as unknown as {
    from(table: 'watchlist_items'): {
      upsert(
        value: typeof item,
        options: { onConflict: 'watchlist_id,ticker' },
      ): {
        select(): {
          single(): Promise<{ data: WatchlistItem | null; error: { message: string } | null }>;
        };
      };
    };
  };
  return repository.from('watchlist_items')
    .upsert(item, { onConflict: 'watchlist_id,ticker' })
    .select()
    .single();
}

export async function loadWatchlistItemDecisionHistory(
  client: WatchlistServerClient,
  userId: string,
  itemId: string,
  limit = 50,
) {
  const result = await client.from('watchlist_item_decision_history').select('*')
    .eq('watchlist_item_id', itemId).eq('user_id', userId)
    .order('version', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
  return result as { data: WatchlistItemDecisionHistory[] | null; error: { message: string } | null };
}
