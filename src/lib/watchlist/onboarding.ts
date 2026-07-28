import type { WatchlistGroup } from './store';

export const SAMPLE_TICKERS = ['600519.SH', '00700.HK', 'AAPL'];

export function createPrimaryBoard(
  groups: WatchlistGroup[],
  name: string,
  id = `primary_${Date.now()}`,
): WatchlistGroup[] {
  if (groups.length > 0) return groups;
  return [{ id, name, tickers: [] }];
}

export function installSampleBoard(groups: WatchlistGroup[], name: string): WatchlistGroup[] {
  if (groups.some((group) => group.id === 'sample_watchlist')) return groups;
  return [
    ...groups,
    { id: 'sample_watchlist', name, tickers: [...SAMPLE_TICKERS] },
  ];
}
