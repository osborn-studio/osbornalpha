export type WatchlistDeleteScope =
  | { kind: 'group'; watchlistId: string }
  | { kind: 'all' };

export function parseWatchlistDeleteScope(request: Request): WatchlistDeleteScope | null {
  const params = new URL(request.url).searchParams;
  const watchlistId = params.get('watchlist_id')?.trim();
  if (watchlistId) return { kind: 'group', watchlistId };
  return params.get('scope') === 'all' ? { kind: 'all' } : null;
}
