'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VersionedWatchlistSnapshot } from '@/lib/watchlist/sync';
import type { WatchlistTrashEntry } from '@/lib/watchlist/trash';
import { watchlistJsonRequest } from '@/lib/watchlist/api-client';

export function useWatchlistTrash(enabled: boolean) {
  const [entries, setEntries] = useState<WatchlistTrashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try {
      const body = await watchlistJsonRequest<{ entries: WatchlistTrashEntry[] }>('/api/watchlist/trash', { signal, cache: 'no-store' }, 'watchlist_trash_request_failed');
      setEntries(body.entries);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'watchlist_trash_request_failed');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [enabled]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const restore = useCallback(async (entry: WatchlistTrashEntry, expectedVersion: number) => {
    setSaving(true); setError(null);
    try {
      const body = await watchlistJsonRequest<{ snapshot: VersionedWatchlistSnapshot }>(`/api/watchlist/trash/${encodeURIComponent(entry.id)}/restore`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion, mutationId: `restore_${entry.id}_${Date.now()}` }),
      }, 'watchlist_restore_failed');
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      return body.snapshot;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'watchlist_restore_failed'); return null; }
    finally { setSaving(false); }
  }, []);
  const remove = useCallback(async (entry: WatchlistTrashEntry) => {
    setSaving(true); setError(null);
    try { await watchlistJsonRequest(`/api/watchlist/trash/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }, 'watchlist_trash_delete_failed'); setEntries((current) => current.filter((item) => item.id !== entry.id)); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'watchlist_trash_delete_failed'); return false; }
    finally { setSaving(false); }
  }, []);
  return { entries, loading, saving, error, restore, remove, refetch: () => load() };
}
