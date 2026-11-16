'use client';
import {useCallback, useSyncExternalStore} from 'react';
import type {ColumnMode} from './strategy-view-model';
const KEY = 'macro.strategy.columns.v1';
const listeners = new Set<() => void>();
let mode: ColumnMode = 'available';
function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    try { mode = window.localStorage.getItem(KEY) === 'all' ? 'all' : 'available'; }
    catch { mode = 'available'; }
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useColumnMode() {
  const current = useSyncExternalStore(subscribe, () => mode, () => 'available' as const);
  const setMode = useCallback((next: ColumnMode) => {
    mode = next;
    try { window.localStorage.setItem(KEY, next); } catch { /* Storage is optional. */ }
    for (const listener of listeners) listener();
  }, []);
  return [current, setMode] as const;
}
