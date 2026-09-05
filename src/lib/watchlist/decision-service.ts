import type { WatchlistItem } from '@/lib/supabase/database.types';
import type { WatchlistDecisionPatch } from './decision';
import {
  loadWatchlistItem,
  updateWatchlistItemDecision,
  type WatchlistServerClient,
} from './server-repository';

export interface WatchlistDecisionCommand {
  patch: WatchlistDecisionPatch;
  expectedVersion: number;
}

export type WatchlistDecisionResult =
  | { status: 'updated'; item: WatchlistItem }
  | { status: 'conflict'; currentItem: WatchlistItem | null }
  | { status: 'not_found' }
  | { status: 'failed' };

export async function executeWatchlistDecision(
  client: WatchlistServerClient,
  userId: string,
  itemId: string,
  command: WatchlistDecisionCommand,
): Promise<WatchlistDecisionResult> {
  const { data, error } = await updateWatchlistItemDecision(
    client,
    itemId,
    command.patch,
    command.expectedVersion,
  );
  if (error?.code === '40001' || error?.message === 'watchlist_decision_conflict') {
    const current = await loadWatchlistItem(client, userId, itemId);
    return { status: 'conflict', currentItem: current.data ?? null };
  }
  if (error?.code === 'P0002' || error?.message === 'watchlist_item_not_found') {
    return { status: 'not_found' };
  }
  if (error) return { status: 'failed' };
  if (!data) return { status: 'not_found' };
  return { status: 'updated', item: data };
}
