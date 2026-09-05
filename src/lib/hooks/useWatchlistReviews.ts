'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRequestSlot, type RequestSlot } from './request-slot';
import {
  WatchlistRequestError,
  watchlistJsonRequest,
  watchlistRequestErrorCode,
} from '@/lib/watchlist/api-client';
import type {
  WatchlistReviewActionCommand,
  WatchlistReviewQueue,
  WatchlistReviewQueueRow,
  WatchlistReviewScope,
} from '@/lib/watchlist/review-workflow';
import type { WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';

const EMPTY_SUMMARY = { overdue: 0, dueToday: 0, upcoming: 0, unscheduled: 0 };

export function useWatchlistReviews(
  enabled: boolean,
  onItemUpdated?: (item: WatchlistOverviewItemRow) => void,
) {
  const [queue, setQueue] = useState<WatchlistReviewQueue | null>(null);
  const [scope, setScope] = useState<WatchlistReviewScope>('due');
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const slot = useRef<RequestSlot | null>(null);
  if (!slot.current) slot.current = createRequestSlot();

  const load = useCallback(async () => {
    if (!enabled) return;
    const lease = slot.current!.begin();
    setLoading(true);
    setErrorCode(null);
    try {
      const body = await watchlistJsonRequest<WatchlistReviewQueue>(
        `/api/watchlist/reviews?scope=${scope}&horizonDays=7&limit=100`,
        { signal: lease.signal, cache: 'no-store' },
        'watchlist_review_queue_unavailable',
      );
      if (slot.current!.isCurrent(lease)) setQueue(body);
    } catch (error) {
      if (slot.current!.isCurrent(lease)) {
        setErrorCode(watchlistRequestErrorCode(error, 'watchlist_review_queue_unavailable'));
      }
    } finally {
      if (slot.current!.isCurrent(lease)) setLoading(false);
    }
  }, [enabled, scope]);

  useEffect(() => {
    if (!enabled) {
      slot.current!.cancel();
      setQueue(null);
      setLoading(false);
      setErrorCode(null);
      return;
    }
    void load();
    const current = slot.current;
    return () => current?.cancel();
  }, [enabled, load]);

  const act = useCallback(async (
    row: WatchlistReviewQueueRow,
    action: WatchlistReviewActionCommand['action'],
    reviewAt: string | null = null,
  ) => {
    setSavingId(row.item.id);
    setErrorCode(null);
    try {
      const body = await watchlistJsonRequest<{ item: WatchlistOverviewItemRow }>(
        `/api/watchlist/items/${encodeURIComponent(row.item.id)}/review`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, expectedVersion: row.item.decision_version, reviewAt }),
        },
        'watchlist_review_update_failed',
      );
      onItemUpdated?.(body.item);
      await load();
      return true;
    } catch (error) {
      setErrorCode(watchlistRequestErrorCode(error, 'watchlist_review_update_failed'));
      if (error instanceof WatchlistRequestError && error.code === 'watchlist_decision_conflict') await load();
      return false;
    } finally {
      setSavingId(null);
    }
  }, [load, onItemUpdated]);

  return {
    queue,
    summary: queue?.summary ?? EMPTY_SUMMARY,
    scope,
    setScope,
    loading,
    savingId,
    errorCode,
    act,
    refetch: load,
  };
}
