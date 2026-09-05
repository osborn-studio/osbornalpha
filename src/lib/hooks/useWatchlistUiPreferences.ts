'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DEFAULT_WATCHLIST_CHART_PREFERENCES,
  DEFAULT_WATCHLIST_UI_PREFERENCES,
  WATCHLIST_UI_PREFERENCES_STORAGE_KEY,
  cloneWatchlistUiPreferences,
  isWatchlistUiPreferences,
  readWatchlistUiPreferencesFromStorage,
  watchlistUiPreferencesEqual,
  withWatchlistBenchmark,
  withWatchlistChartPreferences,
  withWatchlistSavedViews,
  withWatchlistTablePreferences,
  withWatchlistViewMode,
  type WatchlistChartPreferences,
  type WatchlistSavedTableView,
  type WatchlistTablePreferences,
  type WatchlistUiPreferences,
  type WatchlistViewMode,
} from '@/lib/watchlist/ui-preferences';
import { watchlistJsonResult } from '@/lib/watchlist/api-client';

export type WatchlistUiPreferencesSyncStatus = 'local' | 'loading' | 'saving' | 'synced' | 'conflict' | 'error';

interface RemoteSnapshot {
  preferences: WatchlistUiPreferences;
  version: number;
  updatedAt: string | null;
}

interface PendingMutation {
  id: number;
  apply: (current: WatchlistUiPreferences) => WatchlistUiPreferences;
}

function parseRemoteSnapshot(value: unknown): RemoteSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isWatchlistUiPreferences(input.preferences) || !Number.isSafeInteger(input.version) || Number(input.version) < 0
    || (input.updatedAt !== null && typeof input.updatedAt !== 'string')) return null;
  return {
    preferences: cloneWatchlistUiPreferences(input.preferences),
    version: Number(input.version),
    updatedAt: input.updatedAt as string | null,
  };
}

function writeLocal(preferences: WatchlistUiPreferences) {
  try { localStorage.setItem(WATCHLIST_UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences)); } catch {}
}

function applyPending(base: WatchlistUiPreferences, mutations: PendingMutation[]) {
  return mutations.reduce((current, mutation) => mutation.apply(current), base);
}

async function requestRemote(init?: RequestInit) {
  return watchlistJsonResult<unknown>(
    '/api/watchlist/ui-preferences',
    { cache: 'no-store', ...init },
    'watchlist_ui_preferences_unavailable',
  );
}

export function useWatchlistUiPreferences(enabled: boolean) {
  const [preferences, setPreferencesState] = useState(() => cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES));
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<WatchlistUiPreferencesSyncStatus>('local');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const preferencesRef = useRef(preferences);
  const pendingRef = useRef<PendingMutation[]>([]);
  const nextMutationId = useRef(1);
  const versionRef = useRef(0);
  const serverReadyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictRetriesRef = useRef(0);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  enabledRef.current = enabled;

  const replaceLocal = useCallback((next: WatchlistUiPreferences) => {
    const cloned = cloneWatchlistUiPreferences(next);
    preferencesRef.current = cloned;
    setPreferencesState(cloned);
    writeLocal(cloned);
  }, []);

  const scheduleFlush = useCallback((delay = 600) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  flushRef.current = async () => {
    if (!enabledRef.current || !serverReadyRef.current || inFlightRef.current || pendingRef.current.length === 0) return;
    inFlightRef.current = true;
    setStatus('saving');
    setError(null);
    const lastMutationId = pendingRef.current.at(-1)!.id;
    const snapshot = cloneWatchlistUiPreferences(preferencesRef.current);
    try {
      const result = await requestRemote({
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: versionRef.current, preferences: snapshot }),
      });
      const { body } = result;
      const remote = parseRemoteSnapshot(body);
      if (!result.ok && result.status === 409 && remote) {
        versionRef.current = remote.version;
        const rebased = applyPending(remote.preferences, pendingRef.current);
        replaceLocal(rebased);
        conflictRetriesRef.current += 1;
        setStatus('conflict');
        if (conflictRetriesRef.current <= 3) scheduleFlush(100);
        else setError('watchlist_ui_preferences_conflict');
        return;
      }
      if (!result.ok || !remote) throw new Error(result.ok ? 'watchlist_ui_preferences_update_failed' : result.error.code);

      versionRef.current = remote.version;
      conflictRetriesRef.current = 0;
      pendingRef.current = pendingRef.current.filter((mutation) => mutation.id > lastMutationId);
      replaceLocal(applyPending(remote.preferences, pendingRef.current));
      setStatus(pendingRef.current.length > 0 ? 'saving' : 'synced');
      if (pendingRef.current.length > 0) scheduleFlush(100);
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'watchlist_ui_preferences_update_failed');
    } finally {
      inFlightRef.current = false;
    }
  };

  const mutate = useCallback((apply: PendingMutation['apply']) => {
    const next = apply(preferencesRef.current);
    if (watchlistUiPreferencesEqual(next, preferencesRef.current)) return;
    pendingRef.current.push({ id: nextMutationId.current++, apply });
    replaceLocal(next);
    if (serverReadyRef.current && enabledRef.current) scheduleFlush();
  }, [replaceLocal, scheduleFlush]);

  useEffect(() => {
    const local = readWatchlistUiPreferencesFromStorage(localStorage);
    replaceLocal(local);
    setHydrated(true);
  }, [replaceLocal]);

  useEffect(() => {
    if (!hydrated) return;
    if (!enabled) {
      serverReadyRef.current = false;
      versionRef.current = 0;
      setStatus('local');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    requestRemote({ signal: controller.signal })
      .then((result) => {
        if (!result.ok) throw result.error;
        const { body } = result;
        const remote = parseRemoteSnapshot(body);
        if (!remote) throw new Error('invalid_watchlist_ui_preferences_response');
        versionRef.current = remote.version;
        const local = preferencesRef.current;
        const localIsDefault = watchlistUiPreferencesEqual(local, DEFAULT_WATCHLIST_UI_PREFERENCES);
        const remoteIsDefault = watchlistUiPreferencesEqual(remote.preferences, DEFAULT_WATCHLIST_UI_PREFERENCES);
        const useLocalSeed = remote.version === 0 && remoteIsDefault && !localIsDefault;
        if (!useLocalSeed) replaceLocal(applyPending(remote.preferences, pendingRef.current));
        serverReadyRef.current = true;
        setStatus('synced');
        if (useLocalSeed && pendingRef.current.length === 0) {
          pendingRef.current.push({ id: nextMutationId.current++, apply: () => local });
        }
        if (pendingRef.current.length > 0) scheduleFlush(useLocalSeed ? 100 : 600);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'watchlist_ui_preferences_unavailable');
      });
    return () => controller.abort();
  }, [enabled, hydrated, reloadToken, replaceLocal, scheduleFlush]);

  useEffect(() => {
    if (!enabled || !hydrated) return;
    let cancelled = false;
    const refreshOnFocus = async () => {
      if (!serverReadyRef.current || inFlightRef.current || pendingRef.current.length > 0) return;
      inFlightRef.current = true;
      try {
        const result = await requestRemote();
        const remote = result.ok ? parseRemoteSnapshot(result.body) : null;
        if (!remote) throw new Error('watchlist_ui_preferences_unavailable');
        if (cancelled || remote.version <= versionRef.current) return;
        versionRef.current = remote.version;
        replaceLocal(applyPending(remote.preferences, pendingRef.current));
        setStatus('synced');
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'watchlist_ui_preferences_unavailable');
      } finally {
        inFlightRef.current = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshOnFocus();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, hydrated, replaceLocal]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  const setViewMode = useCallback((viewMode: WatchlistViewMode) => {
    mutate((current) => withWatchlistViewMode(current, viewMode));
  }, [mutate]);

  const setTable = useCallback<Dispatch<SetStateAction<WatchlistTablePreferences>>>((next) => {
    mutate((current) => withWatchlistTablePreferences(
      current,
      typeof next === 'function' ? next(current.table) : next,
    ));
  }, [mutate]);

  const setSavedViews = useCallback<Dispatch<SetStateAction<WatchlistSavedTableView[]>>>((next) => {
    mutate((current) => withWatchlistSavedViews(
      current,
      typeof next === 'function' ? next(current.savedViews) : next,
    ));
  }, [mutate]);

  const setBenchmark = useCallback((ticker: string, benchmark: string | null) => {
    mutate((current) => withWatchlistBenchmark(current, ticker, benchmark));
  }, [mutate]);

  const setChart = useCallback((ticker: string, next: SetStateAction<WatchlistChartPreferences>) => {
    mutate((current) => {
      const existing = current.charts[ticker.trim().toUpperCase()] ?? DEFAULT_WATCHLIST_CHART_PREFERENCES;
      const resolved = typeof next === 'function' ? next(existing) : next;
      return withWatchlistChartPreferences(current, ticker, resolved);
    });
  }, [mutate]);

  const retry = useCallback(() => {
    conflictRetriesRef.current = 0;
    if (pendingRef.current.length > 0 && serverReadyRef.current) scheduleFlush(0);
    else setReloadToken((token) => token + 1);
  }, [scheduleFlush]);

  return {
    preferences,
    hydrated,
    status,
    error,
    setViewMode,
    setTable,
    setSavedViews,
    setBenchmark,
    setChart,
    retry,
  };
}
