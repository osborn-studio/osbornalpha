import { getAdminSupabase } from '../src/lib/supabase/admin';

async function main() {
  const client = getAdminSupabase() as any;
  const [candidatesResult, watchlistResult, securitiesResult] = await Promise.all([
    client.from('security_discovery_candidates')
      .select('proposed_ticker,source,status,seen_count,last_seen_at,review_reason')
      .eq('status', 'pending')
      .order('last_seen_at', { ascending: false }),
    client.from('watchlist_items').select('ticker'),
    client.from('stocks_universe').select('ticker'),
  ]);
  if (candidatesResult.error || watchlistResult.error || securitiesResult.error) {
    throw new Error('Unable to read reconciliation inputs.');
  }

  const known = new Set((securitiesResult.data ?? []).map((row: { ticker: string }) => row.ticker));
  const legacyWatchlistTickers = [...new Set(
    (watchlistResult.data ?? [])
      .map((row: { ticker: string }) => row.ticker)
      .filter((ticker: string) => !known.has(ticker)),
  )].sort();

  process.stdout.write(`${JSON.stringify({
    generated_at: new Date().toISOString(),
    unresolved_us_china: candidatesResult.data ?? [],
    legacy_watchlist_tickers: legacyWatchlistTickers,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Reconciliation failed.');
  process.exitCode = 1;
});
