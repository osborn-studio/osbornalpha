import { getAdminSupabase } from '../src/lib/supabase/admin';
import { readAllPages, type PagedQuery } from '../src/lib/securities/reconcile';

interface ReconcileQuery<T> extends PagedQuery<T> {
  eq(column: string, value: string): ReconcileQuery<T>;
  order(column: string, options: { ascending: boolean }): ReconcileQuery<T>;
}

interface ReconcileClient {
  from<T>(table: string): {
    select(columns: string): ReconcileQuery<T>;
  };
}

interface CandidateRow {
  proposed_ticker: string;
  source: string;
  status: string;
  seen_count: number;
  last_seen_at: string;
  review_reason: string | null;
}

async function main() {
  const client = getAdminSupabase() as unknown as ReconcileClient;
  const [candidates, watchlistItems, securities] = await Promise.all([
    readAllPages(() => client.from<CandidateRow>('security_discovery_candidates')
      .select('proposed_ticker,source,status,seen_count,last_seen_at,review_reason')
      .eq('status', 'pending')
      .order('last_seen_at', { ascending: false })),
    readAllPages(() => client.from<{ ticker: string }>('watchlist_items').select('ticker')),
    readAllPages(() => client.from<{ ticker: string }>('stocks_universe').select('ticker')),
  ]);

  const known = new Set(securities.map((row) => row.ticker));
  const legacyWatchlistTickers = [...new Set(
    watchlistItems.map((row) => row.ticker).filter((ticker) => !known.has(ticker)),
  )].sort();

  process.stdout.write(`${JSON.stringify({
    generated_at: new Date().toISOString(),
    unresolved_us_china: candidates,
    legacy_watchlist_tickers: legacyWatchlistTickers,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Reconciliation failed.'}\n`);
  process.exitCode = 1;
});
