export async function refreshWatchlistCompositionSnapshots(db: object, limit: number): Promise<number> {
  const repository = db as {
    rpc(name: 'refresh_watchlist_composition_snapshots', args: { p_limit: number }): Promise<{
      data: number | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('refresh_watchlist_composition_snapshots', { p_limit: limit });
  if (error) throw new Error(`watchlist_composition_refresh_failed:${error.message}`);
  return Number.isSafeInteger(data) && Number(data) >= 0 ? Number(data) : 0;
}
