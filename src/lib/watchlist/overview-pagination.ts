export const WATCHLIST_OVERVIEW_PAGE_SIZE = 50;
export const WATCHLIST_OVERVIEW_MAX_PAGE_SIZE = 50;

export interface WatchlistOverviewCursor {
  groupSort: number;
  itemSort: number;
  itemId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WatchlistOverviewPageRequest {
  /** Legacy offset, retained for older clients that have not migrated. */
  offset: number | null;
  limit: number;
  cursor: WatchlistOverviewCursor | null;
  invalidCursor: boolean;
}

export function parseWatchlistOverviewPage(url: URL): WatchlistOverviewPageRequest {
  const rawOffset = Number(url.searchParams.get('offset') ?? 0);
  const rawLimit = Number(url.searchParams.get('limit') ?? WATCHLIST_OVERVIEW_PAGE_SIZE);
  const rawCursor = url.searchParams.get('cursor');
  let cursor: WatchlistOverviewCursor | null = null;
  let invalidCursor = false;
  if (rawCursor) {
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCursor)) as Record<string, unknown>;
      if (Number.isSafeInteger(parsed.groupSort) && Number.isSafeInteger(parsed.itemSort)
        && typeof parsed.itemId === 'string' && UUID_RE.test(parsed.itemId)) {
        cursor = { groupSort: Number(parsed.groupSort), itemSort: Number(parsed.itemSort), itemId: parsed.itemId };
      } else {
        invalidCursor = true;
      }
    } catch {
      invalidCursor = true;
    }
  }
  return {
    offset: url.searchParams.has('offset')
      ? Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
      : null,
    limit: Number.isSafeInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, WATCHLIST_OVERVIEW_MAX_PAGE_SIZE)
      : WATCHLIST_OVERVIEW_PAGE_SIZE,
    cursor,
    invalidCursor,
  };
}

export function encodeWatchlistOverviewCursor(cursor: WatchlistOverviewCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

export interface WatchlistOverviewPageResult<T> {
  values: T[];
  hasMore: boolean;
}

export function pageItems<T>(items: T[], page: Pick<WatchlistOverviewPageRequest, 'limit'> & { offset?: number | null }) {
  const offset = page.offset ?? 0;
  const values = items.slice(offset, offset + page.limit);
  return {
    values,
    hasMore: offset + values.length < items.length,
  } satisfies WatchlistOverviewPageResult<T>;
}
