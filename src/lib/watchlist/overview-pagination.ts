export const WATCHLIST_OVERVIEW_PAGE_SIZE = 50;
export const WATCHLIST_OVERVIEW_MAX_PAGE_SIZE = 50;

export interface WatchlistOverviewPageRequest {
  offset: number;
  limit: number;
}

export function parseWatchlistOverviewPage(url: URL): WatchlistOverviewPageRequest {
  const rawOffset = Number(url.searchParams.get('offset') ?? 0);
  const rawLimit = Number(url.searchParams.get('limit') ?? WATCHLIST_OVERVIEW_PAGE_SIZE);
  return {
    offset: Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    limit: Number.isSafeInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, WATCHLIST_OVERVIEW_MAX_PAGE_SIZE)
      : WATCHLIST_OVERVIEW_PAGE_SIZE,
  };
}

export function pageItems<T>(items: T[], page: WatchlistOverviewPageRequest) {
  const values = items.slice(page.offset, page.offset + page.limit);
  return {
    values,
    hasMore: page.offset + values.length < items.length,
  };
}
