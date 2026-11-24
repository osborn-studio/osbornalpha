// Daily bars for the on-demand score refreshes (POST /api/analyst/scores, POST /api/reviews).
// Reads Tencent first, with independent US and Eastmoney fallbacks. A shares keep their
// forward-adjusted basis and HK/US keep unadjusted prices on every supported route.

import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { resolveScoringKline, type KlineResolution } from '@/lib/data/kline/reliability';
import { marketPhase } from '@/lib/today/clock';
import { classifyMarket } from '@/lib/utils';
import { exchangeDate } from './forward';

// The chart's 1y range serves daily bars. Longer chart ranges are weekly or monthly.
const SCORING_RANGE = '1y' as const;
const FETCH_CONCURRENCY = 4;

type Resolve = (request: { ticker: string; range: typeof SCORING_RANGE }) => Promise<KlineResolution>;

function completedDailyBars(ticker: string, result: KlineResolution): KlineBar[] | null {
  if (result.freshness !== 'fresh' || result.bars.length === 0) return null;
  const market = classifyMarket(ticker);
  // HKEX's closing auction can last ten minutes beyond continuous trading.
  const cutoff = new Date(Date.parse(result.fetchedAt) - (market === 'HK' ? 10 * 60_000 : 0));
  const today = exchangeDate(cutoff.toISOString(), market);
  const closed = marketPhase(market, cutoff).phase === 'closed';
  // During the lunch break the last daily bar is still forming. A premature T+60 mark
  // would permanently complete the score, even if the closing price changed later.
  return result.bars.filter((bar) => bar.time < today || (bar.time === today && closed));
}

/**
 * Daily bars per ticker, or null when no provider answered. A stale in-memory last-known-good
 * series counts as unavailable: re-scoring from it could overwrite a newer score with older bars.
 */
export async function fetchScoringBars(
  tickers: readonly string[],
  resolve: Resolve = resolveScoringKline,
): Promise<Map<string, KlineBar[] | null>> {
  const unique = [...new Set(tickers)];
  const out = new Map<string, KlineBar[] | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, unique.length) }, async () => {
    while (next < unique.length) {
      const ticker = unique[next++];
      try {
        const r = await resolve({ ticker, range: SCORING_RANGE });
        out.set(ticker, completedDailyBars(ticker, r));
      } catch {
        out.set(ticker, null); // skip this ticker's candidates, keep going
      }
    }
  }));
  return out;
}
