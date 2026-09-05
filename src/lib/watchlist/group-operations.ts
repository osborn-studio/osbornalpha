import type { WatchlistGroup } from './store';

export function moveTickerBetweenWatchlistGroups(
  groups: WatchlistGroup[],
  ticker: string,
  fromGroupId: string,
  toGroupId: string,
): WatchlistGroup[] {
  if (fromGroupId === toGroupId || !groups.some((group) => group.id === toGroupId)) return groups;
  return groups.map((group) => {
    if (group.id === fromGroupId) return { ...group, tickers: group.tickers.filter((item) => item !== ticker) };
    if (group.id === toGroupId && !group.tickers.includes(ticker)) return { ...group, tickers: [...group.tickers, ticker] };
    return group;
  });
}

export function reorderWatchlistGroups(
  groups: WatchlistGroup[],
  fromGroupId: string,
  toGroupId: string,
): WatchlistGroup[] {
  const fromIndex = groups.findIndex((group) => group.id === fromGroupId);
  const toIndex = groups.findIndex((group) => group.id === toGroupId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return groups;
  const next = [...groups];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveTickerWithinWatchlistGroup(
  groups: WatchlistGroup[],
  groupId: string,
  ticker: string,
  direction: 'up' | 'down',
): WatchlistGroup[] {
  const group = groups.find((item) => item.id === groupId);
  if (!group) return groups;
  const fromIndex = group.tickers.indexOf(ticker);
  const toIndex = fromIndex + (direction === 'down' ? 1 : -1);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= group.tickers.length) return groups;
  const tickers = [...group.tickers];
  [tickers[fromIndex], tickers[toIndex]] = [tickers[toIndex], tickers[fromIndex]];
  return groups.map((item) => item.id === groupId ? { ...item, tickers } : item);
}
