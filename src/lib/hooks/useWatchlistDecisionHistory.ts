'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WatchlistItemDecisionHistory, WatchlistItem } from '@/lib/supabase/database.types';
import { decisionRestoreRequest } from '@/lib/watchlist/decision-history';
import { watchlistJsonRequest } from '@/lib/watchlist/api-client';

export function useWatchlistDecisionHistory(itemId: string) {
  const [history, setHistory] = useState<WatchlistItemDecisionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const body = await watchlistJsonRequest<{ history: WatchlistItemDecisionHistory[]; item: WatchlistItem }>(
        `/api/watchlist/items/${encodeURIComponent(itemId)}`,
        { signal, cache: 'no-store' },
        'decision_history_unavailable',
      );
      if (!Array.isArray(body.history)) throw new Error('decision_history_unavailable');
      setHistory(body.history);
      return body.item as WatchlistItem;
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'decision_history_unavailable');
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const restore = async (entry: WatchlistItemDecisionHistory, expectedVersion: number) => {
    const body = decisionRestoreRequest(entry, expectedVersion);
    if (!body) return null;
    setRestoring(true);
    setError(null);
    try {
      const payload = await watchlistJsonRequest<{ item: WatchlistItem }>(`/api/watchlist/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }, 'decision_restore_failed');
      if (!payload.item) throw new Error('decision_restore_failed');
      await load();
      return payload.item as WatchlistItem;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'decision_restore_failed');
      return null;
    } finally {
      setRestoring(false);
    }
  };

  return { history, loading, error, restoring, restore, refetch: () => load() };
}
