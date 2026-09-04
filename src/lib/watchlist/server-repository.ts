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
import type { WatchlistOverviewCursor } from './overview-pagination';
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

/**
 * Research and alert refreshes are user-scoped operations. Keep the ownership
 * check in the repository so every route uses the same RLS-backed boundary.
 */
export async function userOwnsWatchlistTicker(
  client: WatchlistServerClient,
  userId: string,
  ticker: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('watchlist_items')
    .select('id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`watchlist_item_lookup_failed:${error.message}`);
  return !!data;
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
      || typeof item.id !== 'string' || typeof item.ticker !== 'string' || !Number.isInteger(item.sort_order)
      || !Number.isFinite(Number(item.conviction))
      || !Number.isInteger(item.decision_version) || Number(item.decision_version) < 0
      || !Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== 'string')
      || !['inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated'].includes(String(item.status))) {
      throw new Error('invalid_watchlist_overview_row');
    }
    return {
      group: group as unknown as WatchlistOverviewPageRow['group'],
      item: item as unknown as WatchlistOverviewItemRow,
    };
  });
  const hasMore = typeof page.has_more === 'boolean' ? page.has_more : undefined;
  const rawCursor = page.next_cursor;
  const nextCursor = rawCursor && typeof rawCursor === 'object' && !Array.isArray(rawCursor)
    ? (() => {
        const cursor = rawCursor as Record<string, unknown>;
        return Number.isSafeInteger(cursor.group_sort) && Number.isSafeInteger(cursor.item_sort)
          && typeof cursor.item_id === 'string'
          ? { groupSort: Number(cursor.group_sort), itemSort: Number(cursor.item_sort), itemId: cursor.item_id }
          : null;
      })()
    : null;
  return { total: Number(page.total), rows, hasMore, nextCursor };
}

export async function loadWatchlistOverviewPage(
  client: WatchlistServerClient,
  request: { offset: number | null; limit: number; cursor?: WatchlistOverviewCursor | null; ticker?: string | null },
): Promise<WatchlistOverviewDatabasePage> {
  if (request.offset === null) {
    const repository = client as unknown as {
      rpc: (name: 'get_watchlist_overview_cursor', args: {
        p_group_sort: number | null;
        p_item_sort: number | null;
        p_item_id: string | null;
        p_limit: number;
        p_ticker: string | null;
      }) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const cursor = request.cursor ?? null;
    const { data, error } = await repository.rpc('get_watchlist_overview_cursor', {
      p_group_sort: cursor?.groupSort ?? null,
      p_item_sort: cursor?.itemSort ?? null,
      p_item_id: cursor?.itemId ?? null,
      p_limit: request.limit,
      p_ticker: request.ticker ?? null,
    });
    if (error) throw new Error(error.message);
    return parseOverviewPage(data);
  }
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
