import type { WatchlistItem } from '@/lib/supabase/database.types';
import type { WatchlistDecisionPatch } from './decision';
import {
  loadWatchlistItem,
  updateWatchlistItemDecision,
  updateWatchlistReviewAction,
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

type VersionedUpdate = () => Promise<{
  data: WatchlistItem | null;
  error: { code?: string; message: string } | null;
}>;

async function executeVersionedWatchlistUpdate(
  client: WatchlistServerClient,
  userId: string,
  itemId: string,
  update: VersionedUpdate,
): Promise<WatchlistDecisionResult> {
  const { data, error } = await update();
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

export async function executeWatchlistDecision(
  client: WatchlistServerClient,
  userId: string,
  itemId: string,
  command: WatchlistDecisionCommand,
): Promise<WatchlistDecisionResult> {
  return executeVersionedWatchlistUpdate(client, userId, itemId, () => updateWatchlistItemDecision(
    client, itemId, command.patch, command.expectedVersion,
  ));
}

export async function executeWatchlistReview(
  client: WatchlistServerClient,
  userId: string,
  itemId: string,
  command: { action: 'complete' | 'snooze'; expectedVersion: number; reviewAt: string | null },
): Promise<WatchlistDecisionResult> {
  return executeVersionedWatchlistUpdate(client, userId, itemId, () => updateWatchlistReviewAction(
    client, itemId, command.expectedVersion, command.action, command.reviewAt,
  ));
}
