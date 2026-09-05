import { isLiveQuotePayload } from './batch-client';
import type { QuoteShape } from './resolve-quote';

export interface SharedQuoteSnapshotRow {
  ticker: string;
  market: QuoteShape['market'];
  quote: Record<string, unknown>;
  source: string;
  observed_at: string;
  fetched_at: string;
  valid_until: string;
  stale_until: string;
  price: number | null;
  change_pct: number | null;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  previous_close: number | null;
  volume: number | null;
  amount: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  pb: number | null;
  turnover: number | null;
  volume_ratio: number | null;
  amplitude: number | null;
  updated_at: string;
}

export interface SharedQuoteSnapshotSet {
  fresh: Record<string, QuoteShape>;
  stale: Record<string, QuoteShape>;
}

export type QuoteSnapshotDatabase = object;

function repositoryOf(db: QuoteSnapshotDatabase) {
  return db as {
    from(name: 'market_quote_snapshots'): {
      select(columns: string): {
        in(column: 'ticker', values: string[]): Promise<{
          data: SharedQuoteSnapshotRow[] | null;
          error: { message: string } | null;
        }>;
      };
      upsert(rows: SharedQuoteSnapshotRow[], options: { onConflict: 'ticker' }): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
}

export async function loadSharedQuoteSnapshots(
  db: QuoteSnapshotDatabase,
  tickers: string[],
  now = new Date(),
): Promise<SharedQuoteSnapshotSet> {
  const unique = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))];
  if (unique.length === 0) return { fresh: {}, stale: {} };
  const { data, error } = await repositoryOf(db).from('market_quote_snapshots')
    .select('ticker,market,quote,source,observed_at,fetched_at,valid_until,stale_until,updated_at')
    .in('ticker', unique);
  if (error) throw new Error(`shared_quote_snapshot_load_failed:${error.message}`);
  const fresh: Record<string, QuoteShape> = {};
  const stale: Record<string, QuoteShape> = {};
  const timestamp = now.getTime();
  for (const row of data ?? []) {
    const ticker = row.ticker.toUpperCase();
    if (!isLiveQuotePayload(row.quote, ticker)) continue;
    const quote = row.quote as unknown as QuoteShape;
    const validUntil = new Date(row.valid_until).getTime();
    const staleUntil = new Date(row.stale_until).getTime();
    if (Number.isFinite(validUntil) && validUntil > timestamp) fresh[ticker] = quote;
    else if (Number.isFinite(staleUntil) && staleUntil > timestamp) {
      stale[ticker] = { ...quote, stale: true, delayed: true };
    }
  }
  return { fresh, stale };
}

export async function persistSharedQuoteSnapshots(
  db: QuoteSnapshotDatabase,
  quotes: QuoteShape[],
  fetchedAt = new Date(),
  ttl: { freshMs?: number; staleMs?: number } = {},
): Promise<void> {
  const freshMs = Math.max(1_000, ttl.freshMs ?? 60_000);
  const staleMs = Math.max(freshMs, ttl.staleMs ?? 15 * 60_000);
  const rows = quotes
    .filter((quote) => isLiveQuotePayload(quote, quote.ticker))
    .map((quote): SharedQuoteSnapshotRow => ({
      ticker: quote.ticker.toUpperCase(),
      market: quote.market,
      quote: quote as unknown as Record<string, unknown>,
      source: quote.source,
      observed_at: quote.updated_at,
      fetched_at: fetchedAt.toISOString(),
      valid_until: new Date(fetchedAt.getTime() + freshMs).toISOString(),
      stale_until: new Date(fetchedAt.getTime() + staleMs).toISOString(),
      price: quote.price,
      change_pct: quote.change_pct,
      open_price: quote.open,
      high_price: quote.high,
      low_price: quote.low,
      previous_close: quote.prev_close,
      volume: quote.volume,
      amount: quote.amount,
      market_cap: quote.market_cap,
      pe_ttm: quote.pe_ttm,
      pb: quote.pb,
      turnover: quote.turnover,
      volume_ratio: quote.volume_ratio,
      amplitude: quote.amplitude,
      updated_at: fetchedAt.toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await repositoryOf(db).from('market_quote_snapshots').upsert(rows, { onConflict: 'ticker' });
  if (error) throw new Error(`shared_quote_snapshot_persist_failed:${error.message}`);
}
