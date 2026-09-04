'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchlistOverviewItemRow, WatchlistOverviewResponse, WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
export type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';

export function useWatchlistOverview(enabled: boolean) {
  const [rows, setRows] = useState<Record<string, WatchlistOverviewRow>>({});
  const rowsRef = useRef<Record<string, WatchlistOverviewRow>>({});
  const ensuringRef = useRef(new Map<string, Promise<WatchlistOverviewRow | null>>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ partial: false, total: 0, generatedAt: null as string | null });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const fetchPage = useCallback(async (cursor: string | null, signal?: AbortSignal, ticker?: string) => {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    if (ticker) query.set('ticker', ticker);
    const response = await fetch(`/api/watchlist/overview?${query}`, { signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !Array.isArray(body.rows)) throw new Error(body?.error || 'overview_unavailable');
    return body as WatchlistOverviewResponse;
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const mapped: Record<string, WatchlistOverviewRow> = {};
      const payload = await fetchPage(null, signal);
      for (const row of payload.rows) {
        if (row?.item?.ticker && !mapped[row.item.ticker]) mapped[row.item.ticker] = row;
      }
      setRows(mapped);
      setNextCursor(payload.page?.nextCursor ?? null);
      setMeta({ partial: payload.page?.hasMore ?? payload.partial, total: payload.total, generatedAt: payload.generatedAt });
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'overview_unavailable');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      setRows({});
      setLoading(false);
      setLoadingMore(false);
      setNextCursor(null);
      setMeta({ partial: false, total: 0, generatedAt: null });
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMore || !meta.partial || !nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const payload = await fetchPage(nextCursor);
      setRows((current) => ({
        ...current,
        ...Object.fromEntries(payload.rows.filter((row) => row?.item?.ticker).map((row) => [row.item.ticker, row])),
      }));
      setNextCursor(payload.page?.nextCursor ?? null);
      setMeta({ partial: payload.page?.hasMore ?? payload.partial, total: payload.total, generatedAt: payload.generatedAt });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'overview_unavailable');
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, fetchPage, loadingMore, meta.partial, nextCursor]);

  const ensureTicker = useCallback(async (ticker: string) => {
    if (!enabled || rowsRef.current[ticker]?.market) return rowsRef.current[ticker] ?? null;
    const existing = ensuringRef.current.get(ticker);
    if (existing) return existing;
    const pending = (async () => {
      const payload = await fetchPage(null, undefined, ticker);
      const row = payload.rows.find((candidate) => candidate.item.ticker === ticker) ?? null;
      if (row) setRows((current) => ({ ...current, [ticker]: row }));
      return row;
    })().catch(() => null).finally(() => ensuringRef.current.delete(ticker));
    ensuringRef.current.set(ticker, pending);
    return pending;
  }, [enabled, fetchPage]);

  const updateItem = useCallback((item: WatchlistOverviewItemRow) => {
    setRows((current) => {
      const row = current[item.ticker];
      return row ? { ...current, [item.ticker]: { ...row, item } } : current;
    });
  }, []);

  return { rows, loading, loadingMore, error, ...meta, refetch: () => load(), loadMore, ensureTicker, updateItem };
}
