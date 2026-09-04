'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VersionedWatchlistSnapshot } from '@/lib/watchlist/sync';
import type { WatchlistTrashEntry } from '@/lib/watchlist/trash';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'watchlist_trash_request_failed');
  return body as T;
}

export function useWatchlistTrash(enabled: boolean) {
  const [entries, setEntries] = useState<WatchlistTrashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try {
      const body = await requestJson<{ entries: WatchlistTrashEntry[] }>('/api/watchlist/trash', { signal, cache: 'no-store' });
      setEntries(body.entries);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'watchlist_trash_request_failed');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [enabled]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const restore = useCallback(async (entry: WatchlistTrashEntry, expectedVersion: number) => {
    setSaving(true); setError(null);
    try {
      const body = await requestJson<{ snapshot: VersionedWatchlistSnapshot }>(`/api/watchlist/trash/${encodeURIComponent(entry.id)}/restore`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion, mutationId: `restore_${entry.id}_${Date.now()}` }),
      });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      return body.snapshot;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'watchlist_restore_failed'); return null; }
    finally { setSaving(false); }
  }, []);
  const remove = useCallback(async (entry: WatchlistTrashEntry) => {
    setSaving(true); setError(null);
    try { await requestJson(`/api/watchlist/trash/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }); setEntries((current) => current.filter((item) => item.id !== entry.id)); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'watchlist_trash_delete_failed'); return false; }
    finally { setSaving(false); }
  }, []);
  return { entries, loading, saving, error, restore, remove, refetch: () => load() };
}
