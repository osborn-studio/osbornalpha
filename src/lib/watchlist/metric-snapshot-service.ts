import type { WatchlistMetricRefreshState } from '@/lib/supabase/database.types';
import { buildComputedWatchlistOverview } from './overview';
import { metricSnapshotInsert } from './metric-snapshot';
import { upsertWatchlistMetricSnapshot, type MetricDatabase } from './metric-snapshot-repository';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';

interface MetricRefreshDependencies {
  build: typeof buildComputedWatchlistOverview;
  persist: typeof upsertWatchlistMetricSnapshot;
}

const productionDependencies: MetricRefreshDependencies = {
  build: buildComputedWatchlistOverview,
  persist: upsertWatchlistMetricSnapshot,
};

export async function refreshWatchlistMetricSnapshot(
  db: MetricDatabase,
  claimed: WatchlistMetricRefreshState,
  dependencies: MetricRefreshDependencies = productionDependencies,
  now = new Date(),
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): Promise<void> {
  const computed = await dependencies.build([claimed.ticker], 'en', {
    includeMarket: false,
    benchmarkTicker: claimed.benchmark_ticker,
    historyRange: claimed.history_range,
    includeTotalReturn: true,
  });
  const history = computed[claimed.ticker]?.history;
  if (!history?.value) throw new Error('watchlist_metric_snapshot_unavailable');
  await dependencies.persist(db, metricSnapshotInsert(
    claimed.ticker,
    claimed.market,
    claimed.history_range,
    claimed.benchmark_ticker,
    history,
    now,
    calendar,
  ));
}
