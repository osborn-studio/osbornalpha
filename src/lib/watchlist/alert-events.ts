export interface WatchlistAlertEventQuery {
  limit: number;
  unreadOnly: boolean;
  itemId: string | null;
}

export function parseWatchlistAlertEventQuery(url: URL): WatchlistAlertEventQuery {
  const rawLimit = Number(url.searchParams.get('limit') ?? 50);
  const itemId = url.searchParams.get('itemId')?.trim() || null;
  return {
    limit: Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50,
    unreadOnly: url.searchParams.get('unread') === '1',
    itemId,
  };
}

export function parseWatchlistAlertReadPatch(body: unknown): { read: boolean } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body as Record<string, unknown>).length !== 1) return null;
  const read = (body as Record<string, unknown>).read;
  if (typeof read !== 'boolean') return null;
  return { read };
}

export function isWatchlistAlertRetryPatch(body: unknown): boolean {
  return !!body
    && typeof body === 'object'
    && !Array.isArray(body)
    && (body as Record<string, unknown>).retry === true
    && Object.keys(body as Record<string, unknown>).length === 1;
}
