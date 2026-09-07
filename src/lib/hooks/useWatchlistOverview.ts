'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataEnvelope, WatchlistOverviewItemRow, WatchlistOverviewResponse, WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { createRequestSlot, type RequestSlot } from './request-slot';
import { watchlistJsonRequest } from '@/lib/watchlist/api-client';
import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
import type { WatchlistComposition } from '@/lib/watchlist/composition';
import type { WatchlistDataCapability } from '@/lib/watchlist/data-capability';
import type {
  WatchlistOverviewClientQuery,
} from '@/lib/watchlist/overview-query';
import { WATCHLIST_OVERVIEW_METRICS, WATCHLIST_OVERVIEW_QUERY_SORTS } from '@/lib/watchlist/overview-fields';
export type { WatchlistOverviewClientQuery } from '@/lib/watchlist/overview-query';
export type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';

const DATA_STATUSES = new Set(['fresh', 'delayed', 'stale', 'unavailable']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDataEnvelope(value: unknown): value is DataEnvelope<unknown> {
  if (!isRecord(value)) return false;
  const coverage = value.coverage;
  return (value.value === null || isRecord(value.value))
    && (value.asOf === null || typeof value.asOf === 'string')
    && (value.source === null || typeof value.source === 'string')
    && typeof value.status === 'string'
    && DATA_STATUSES.has(value.status)
    && Array.isArray(value.warnings)
    && value.warnings.every((warning) => typeof warning === 'string')
    && (value.reasonCode === undefined || value.reasonCode === null || typeof value.reasonCode === 'string')
    && (value.retryable === undefined || typeof value.retryable === 'boolean')
    && (coverage === undefined || coverage === null || (
      isRecord(coverage)
      && Number.isSafeInteger(coverage.available) && Number(coverage.available) >= 0
      && Number.isSafeInteger(coverage.total) && Number(coverage.total) >= Number(coverage.available)
    ))
    && (value.observations === undefined || value.observations === null
      || (Number.isSafeInteger(value.observations) && Number(value.observations) >= 0));
}

function isAlertSummary(value: unknown): boolean {
  return isRecord(value)
    && Number.isSafeInteger(value.enabledCount) && Number(value.enabledCount) >= 0
    && Number.isSafeInteger(value.unreadCount) && Number(value.unreadCount) >= 0
    && Number.isSafeInteger(value.failedDeliveryCount) && Number(value.failedDeliveryCount) >= 0
    && (value.latestTriggeredAt === null || typeof value.latestTriggeredAt === 'string');
}

function isDataCapability(value: unknown): value is WatchlistDataCapability {
  const runtime = isRecord(value) ? value.runtime : null;
  return isRecord(value)
    && ['A', 'HK', 'US', 'JP', 'KR', 'TW'].includes(String(value.market))
    && ['quote', 'intradayChart', 'historyChart', 'totalReturn', 'financials', 'news', 'reports'].includes(String(value.feature))
    && ['ready', 'degraded', 'unavailable'].includes(String(value.status))
    && Array.isArray(value.providers) && value.providers.every((provider) => typeof provider === 'string')
    && (value.reasonCode === null || typeof value.reasonCode === 'string')
    && isRecord(runtime)
    && ['healthy', 'degraded', 'unavailable', 'unknown'].includes(String(runtime.status))
    && (runtime.lastCheckedAt === null || typeof runtime.lastCheckedAt === 'string')
    && (runtime.lastSuccessAt === null || typeof runtime.lastSuccessAt === 'string')
    && (runtime.latencyMs === null || typeof runtime.latencyMs === 'number')
    && (runtime.circuitState === null || ['closed', 'open', 'half_open'].includes(String(runtime.circuitState)));
}

function isQuerySnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return WATCHLIST_OVERVIEW_QUERY_SORTS.includes(String(value.sortKey) as never)
    && (value.sortNumber === null || Number.isFinite(value.sortNumber))
    && (value.sortText === null || typeof value.sortText === 'string')
    && (value.sortAsOf === null || typeof value.sortAsOf === 'string')
    && (value.metricKey === null || WATCHLIST_OVERVIEW_METRICS.includes(String(value.metricKey) as never))
    && (value.metricNumber === null || Number.isFinite(value.metricNumber))
    && (value.metricAsOf === null || typeof value.metricAsOf === 'string')
    && (value.currency === null || typeof value.currency === 'string');
}

function isOverviewRow(value: unknown): value is WatchlistOverviewRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const group = row.group;
  const item = row.item;
  const identity = row.identity;
  const alerts = row.alerts;
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
    && (row.peer === null || isDataEnvelope(row.peer))
    && isDataEnvelope(row.research)
    && isDataEnvelope(alerts)
    && (alerts.value === null || isAlertSummary(alerts.value))
    && (row.querySnapshot === undefined || row.querySnapshot === null || isQuerySnapshot(row.querySnapshot));
}

function isOverviewResponse(value: unknown): value is WatchlistOverviewResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) return false;
  const page = value.page;
  const total = value.total;
  return typeof value.generatedAt === 'string'
    && typeof value.ownerId === 'string'
    && Number.isSafeInteger(value.version)
    && (value.dataStatus === 'complete' || value.dataStatus === 'partial')
    && Array.isArray(value.warnings) && value.warnings.every((warning) => typeof warning === 'string')
    && Array.isArray(value.capabilities) && value.capabilities.every(isDataCapability)
    && typeof value.partial === 'boolean'
    && Number.isSafeInteger(total) && Number(total) >= 0
    && (value.composition === null || isDataEnvelope(value.composition))
    && isRecord(page)
    && Number.isSafeInteger(page.limit) && Number(page.limit) > 0
    && (page.offset === null || Number.isSafeInteger(page.offset))
    && (page.cursor === null || typeof page.cursor === 'string')
    && (page.nextCursor === null || typeof page.nextCursor === 'string')
    && typeof page.hasMore === 'boolean'
    && value.rows.every(isOverviewRow);
}

export function watchlistOverviewQueryString(query: WatchlistOverviewClientQuery): string {
  const params = new URLSearchParams({ sort: query.sort, direction: query.direction });
  if (query.query?.trim()) params.set('q', query.query.trim());
  if (query.groupId) params.set('groupId', query.groupId);
  if (query.market) params.set('market', query.market);
  if (query.quoteStatus) params.set('quoteStatus', query.quoteStatus);
  if (query.decisionStatus) params.set('decisionStatus', query.decisionStatus);
  if (query.tag?.trim()) params.set('tag', query.tag.trim());
  if (query.historyRange) params.set('historyRange', query.historyRange);
  if (query.metric) params.set('metric', query.metric);
  if (query.metricMin != null && Number.isFinite(query.metricMin)) params.set('metricMin', String(query.metricMin));
  if (query.metricMax != null && Number.isFinite(query.metricMax)) params.set('metricMax', String(query.metricMax));
  return params.toString();
}

export function useWatchlistOverview(enabled: boolean, serverQuery: WatchlistOverviewClientQuery | null = null) {
  const [rows, setRows] = useState<Record<string, WatchlistOverviewRow>>({});
  const rowsRef = useRef<Record<string, WatchlistOverviewRow>>({});
  const ensuringRef = useRef(new Map<string, Promise<WatchlistOverviewRow | null>>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({
    partial: false,
    total: 0,
    generatedAt: null as string | null,
    composition: null as DataEnvelope<WatchlistComposition> | null,
    dataStatus: 'complete' as WatchlistOverviewResponse['dataStatus'],
    warnings: [] as string[],
    capabilities: [] as WatchlistDataCapability[],
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSlot = useRef<RequestSlot | null>(null);
  const loadMoreSlot = useRef<RequestSlot | null>(null);
  const ensureSlots = useRef(new Map<string, RequestSlot>());
  const generation = useRef(0);

  if (!loadSlot.current) loadSlot.current = createRequestSlot();
  if (!loadMoreSlot.current) loadMoreSlot.current = createRequestSlot();

  const bulkQueryString = useMemo(() => {
    if (!serverQuery) return '';
    return watchlistOverviewQueryString(serverQuery);
  }, [serverQuery]);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const fetchPage = useCallback(async (
    cursor: string | null,
    signal?: AbortSignal,
    ticker?: string,
    benchmark?: string | null,
    range?: WatchlistHistoryRange,
  ) => {
    const query = new URLSearchParams({ limit: '50' });
    if (!ticker && bulkQueryString) {
      for (const [key, value] of new URLSearchParams(bulkQueryString)) query.set(key, value);
    }
    if (cursor) query.set('cursor', cursor);
    if (ticker) query.set('ticker', ticker);
    if (benchmark) query.set('benchmark', benchmark);
    if (range) query.set('range', range);
    const body = await watchlistJsonRequest<unknown>(`/api/watchlist/overview?${query}`, {
      signal,
      cache: 'no-store',
    }, 'overview_unavailable');
    if (!isOverviewResponse(body)) throw new Error('overview_unavailable');
    return body as WatchlistOverviewResponse;
  }, [bulkQueryString]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const lease = loadSlot.current!.begin();
    loadMoreSlot.current!.cancel();
    for (const slot of ensureSlots.current.values()) slot.cancel();
    ensureSlots.current.clear();
    const loadGeneration = ++generation.current;
    rowsRef.current = {};
    setRows({});
    setNextCursor(null);
    setMeta({ partial: false, total: 0, generatedAt: null, composition: null, dataStatus: 'complete', warnings: [], capabilities: [] });
    setLoadingMore(false);
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
      setMeta({
        partial: payload.page?.hasMore ?? payload.partial,
        total: payload.total,
        generatedAt: payload.generatedAt,
        composition: payload.composition,
        dataStatus: payload.dataStatus,
        warnings: payload.warnings,
        capabilities: payload.capabilities,
      });
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
      setMeta({ partial: false, total: 0, generatedAt: null, composition: null, dataStatus: 'complete', warnings: [], capabilities: [] });
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
      setMeta({
        partial: payload.page?.hasMore ?? payload.partial,
        total: payload.total,
        generatedAt: payload.generatedAt,
        composition: payload.composition,
        dataStatus: payload.dataStatus,
        warnings: payload.warnings,
        capabilities: payload.capabilities,
      });
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

  return {
    rows, loading, loadingMore, error, ...meta,
    serverQueryActive: enabled && serverQuery !== null,
    refetch: () => load(), loadMore, ensureTicker, updateItem,
  };
}
