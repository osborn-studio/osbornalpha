'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataEnvelope, WatchlistOverviewItemRow, WatchlistOverviewResponse, WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { createRequestSlot, type RequestSlot } from './request-slot';
import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
export type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';

const DATA_STATUSES = new Set(['fresh', 'delayed', 'stale', 'unavailable']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDataEnvelope(value: unknown): value is DataEnvelope<unknown> {
  if (!isRecord(value)) return false;
  return (value.value === null || isRecord(value.value))
    && (value.asOf === null || typeof value.asOf === 'string')
    && (value.source === null || typeof value.source === 'string')
    && typeof value.status === 'string'
    && DATA_STATUSES.has(value.status)
    && Array.isArray(value.warnings)
    && value.warnings.every((warning) => typeof warning === 'string');
}

function isOverviewRow(value: unknown): value is WatchlistOverviewRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const group = row.group;
  const item = row.item;
  const identity = row.identity;
  return !!group && typeof group === 'object' && !Array.isArray(group)
    && typeof (group as Record<string, unknown>).id === 'string'
    && typeof (group as Record<string, unknown>).name === 'string'
    && Number.isInteger((group as Record<string, unknown>).sortOrder)
    && !!item && typeof item === 'object' && !Array.isArray(item)
    && typeof (item as Record<string, unknown>).id === 'string'
    && typeof (item as Record<string, unknown>).ticker === 'string'
    && (identity === null || isRecord(identity))
    && (row.market === null || isDataEnvelope(row.market))
    && (row.history === null || isDataEnvelope(row.history))
    && isDataEnvelope(row.research);
}

function isOverviewResponse(value: unknown): value is WatchlistOverviewResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) return false;
  const page = value.page;
  const total = value.total;
  return typeof value.generatedAt === 'string'
    && typeof value.ownerId === 'string'
    && Number.isSafeInteger(value.version)
    && typeof value.partial === 'boolean'
    && Number.isSafeInteger(total) && Number(total) >= 0
    && isRecord(page)
    && Number.isSafeInteger(page.limit) && Number(page.limit) > 0
    && (page.offset === null || Number.isSafeInteger(page.offset))
    && (page.cursor === null || typeof page.cursor === 'string')
    && (page.nextCursor === null || typeof page.nextCursor === 'string')
    && typeof page.hasMore === 'boolean'
    && value.rows.every(isOverviewRow);
}

export function useWatchlistOverview(enabled: boolean) {
  const [rows, setRows] = useState<Record<string, WatchlistOverviewRow>>({});
  const rowsRef = useRef<Record<string, WatchlistOverviewRow>>({});
  const ensuringRef = useRef(new Map<string, Promise<WatchlistOverviewRow | null>>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ partial: false, total: 0, generatedAt: null as string | null });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSlot = useRef<RequestSlot | null>(null);
  const loadMoreSlot = useRef<RequestSlot | null>(null);
  const ensureSlots = useRef(new Map<string, RequestSlot>());
  const generation = useRef(0);

  if (!loadSlot.current) loadSlot.current = createRequestSlot();
  if (!loadMoreSlot.current) loadMoreSlot.current = createRequestSlot();

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const fetchPage = useCallback(async (
    cursor: string | null,
    signal?: AbortSignal,
    ticker?: string,
    benchmark?: string | null,
    range?: WatchlistHistoryRange,
  ) => {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    if (ticker) query.set('ticker', ticker);
    if (benchmark) query.set('benchmark', benchmark);
    if (range) query.set('range', range);
    const response = await fetch(`/api/watchlist/overview?${query}`, { signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !isOverviewResponse(body)) {
      throw new Error(body?.error || 'overview_unavailable');
    }
    return body as WatchlistOverviewResponse;
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    const lease = loadSlot.current!.begin();
    loadMoreSlot.current!.cancel();
    for (const slot of ensureSlots.current.values()) slot.cancel();
    ensureSlots.current.clear();
    const loadGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const mapped: Record<string, WatchlistOverviewRow> = {};
      const payload = await fetchPage(null, lease.signal);
      if (!loadSlot.current!.isCurrent(lease) || loadGeneration !== generation.current) return;
      for (const row of payload.rows) {
        if (row?.item?.ticker && !mapped[row.item.ticker]) mapped[row.item.ticker] = row;
      }
      setRows(mapped);
      setNextCursor(payload.page?.nextCursor ?? null);
      setMeta({ partial: payload.page?.hasMore ?? payload.partial, total: payload.total, generatedAt: payload.generatedAt });
    } catch (caught) {
      if (!loadSlot.current!.isCurrent(lease)) return;
      setError(caught instanceof Error ? caught.message : 'overview_unavailable');
    } finally {
      if (loadSlot.current!.isCurrent(lease)) setLoading(false);
    }
  }, [enabled, fetchPage]);

  useEffect(() => {
    if (!enabled) {
      loadSlot.current!.cancel();
      loadMoreSlot.current!.cancel();
      for (const slot of ensureSlots.current.values()) slot.cancel();
      ensureSlots.current.clear();
      generation.current += 1;
      setRows({});
      setLoading(false);
      setLoadingMore(false);
      setNextCursor(null);
      setMeta({ partial: false, total: 0, generatedAt: null });
      return;
    }
    void load();
    const ensureSlotMap = ensureSlots.current;
    return () => {
      loadSlot.current!.cancel();
      loadMoreSlot.current!.cancel();
      for (const slot of ensureSlotMap.values()) slot.cancel();
      ensureSlotMap.clear();
      generation.current += 1;
    };
  }, [enabled, load]);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMore || !meta.partial || !nextCursor) return;
    const lease = loadMoreSlot.current!.begin();
    const loadGeneration = generation.current;
    const cursor = nextCursor;
    setLoadingMore(true);
    setError(null);
    try {
      const payload = await fetchPage(cursor, lease.signal);
      if (!loadMoreSlot.current!.isCurrent(lease) || loadGeneration !== generation.current) return;
      setRows((current) => ({
        ...current,
        ...Object.fromEntries(payload.rows.filter((row) => row?.item?.ticker).map((row) => [row.item.ticker, row])),
      }));
      setNextCursor(payload.page?.nextCursor ?? null);
      setMeta({ partial: payload.page?.hasMore ?? payload.partial, total: payload.total, generatedAt: payload.generatedAt });
    } catch (caught) {
      if (!loadMoreSlot.current!.isCurrent(lease)) return;
      setError(caught instanceof Error ? caught.message : 'overview_unavailable');
    } finally {
      if (loadMoreSlot.current!.isCurrent(lease)) setLoadingMore(false);
    }
  }, [enabled, fetchPage, loadingMore, meta.partial, nextCursor]);

  const ensureTicker = useCallback(async (
    ticker: string,
    options: { benchmark?: string | null; range?: WatchlistHistoryRange; force?: boolean } = {},
  ) => {
    if (!enabled || (!options.force && rowsRef.current[ticker]?.market)) return rowsRef.current[ticker] ?? null;
    const existing = ensuringRef.current.get(ticker);
    if (existing && !options.force) return existing;
    if (options.force) {
      ensureSlots.current.get(ticker)?.cancel();
      ensureSlots.current.delete(ticker);
      ensuringRef.current.delete(ticker);
    }
    const slot = createRequestSlot();
    ensureSlots.current.set(ticker, slot);
    const lease = slot.begin();
    const loadGeneration = generation.current;
    const pending = (async () => {
      const payload = await fetchPage(null, lease.signal, ticker, options.benchmark ?? null, options.range);
      if (!slot.isCurrent(lease) || loadGeneration !== generation.current) return null;
      const row = payload.rows.find((candidate) => candidate.item.ticker === ticker) ?? null;
      if (row) setRows((current) => ({ ...current, [ticker]: row }));
      return row;
    })().catch(() => null).finally(() => {
      if (ensuringRef.current.get(ticker) === pending) ensuringRef.current.delete(ticker);
      if (ensureSlots.current.get(ticker) === slot) ensureSlots.current.delete(ticker);
    });
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
