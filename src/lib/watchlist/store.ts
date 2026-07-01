import { MOCK_DATA } from '@/lib/data/mock';

export interface WatchlistGroup {
  id: string;
  name: string;
  tickers: string[];
}

export const WATCHLIST_STORAGE_KEY = 'stock-monitor:watchlist:v2';
export const WATCHLIST_CHANGED_EVENT = 'stock-monitor:watchlist-changed';

export function defaultWatchlistGroups(): WatchlistGroup[] {
  return MOCK_DATA.watchlist_groups.map((g) => ({
    id: g.id,
    name: g.name,
    tickers: [...g.tickers],
  }));
}

export function parseWatchlistGroups(raw: string | null): WatchlistGroup[] | null {
  if (!raw) return null;

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return null;

  const groups: WatchlistGroup[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const rawTickers: unknown[] = Array.isArray(item.tickers) ? item.tickers : [];
    const tickers = rawTickers
          .filter((ticker: unknown): ticker is string => typeof ticker === 'string')
          .map((ticker) => ticker.trim().toUpperCase())
          .filter(Boolean)

    if (!id || !name) return null;
    groups.push({ id, name, tickers: Array.from(new Set(tickers)) });
  }

  return groups;
}

export function readLocalWatchlist(): WatchlistGroup[] | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseWatchlistGroups(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function resolveInitialWatchlist(): WatchlistGroup[] {
  return readLocalWatchlist() || defaultWatchlistGroups();
}

export function writeLocalWatchlist(groups: WatchlistGroup[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(groups));
  window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT, { detail: groups }));
}

export function subscribeToWatchlist(callback: (groups: WatchlistGroup[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const notify = () => callback(resolveInitialWatchlist());
  const onStorage = (event: StorageEvent) => {
    if (event.key === WATCHLIST_STORAGE_KEY) notify();
  };
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<WatchlistGroup[]>).detail;
    callback(Array.isArray(detail) ? detail : resolveInitialWatchlist());
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(WATCHLIST_CHANGED_EVENT, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(WATCHLIST_CHANGED_EVENT, onCustom);
  };
}

export function uniqueWatchlistTickers(groups: WatchlistGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => group.tickers)));
}
