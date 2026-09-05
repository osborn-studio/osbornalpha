export interface WatchlistRlsObservation {
  table: string;
  required: boolean;
  accountAOwn: boolean;
  accountBOwn: boolean;
  accountAReadsB: boolean;
  accountBReadsA: boolean;
}

export interface WatchlistRlsCanaryResult extends WatchlistRlsObservation {
  ok: boolean;
  coverage: 'full' | 'account-a-only' | 'account-b-only' | 'none';
  detail?: 'cross_tenant_read' | 'required_fixture_missing';
}

export const WATCHLIST_RLS_TABLES = [
  { table: 'watchlists', required: true },
  { table: 'user_preferences', required: true },
  { table: 'watchlist_items', required: true },
  { table: 'watchlist_item_decision_history', required: true },
  { table: 'watchlist_sync_state', required: true },
  { table: 'watchlist_alerts', required: true },
  { table: 'watchlist_alert_events', required: true },
  { table: 'watchlist_trash', required: true },
  { table: 'perspectives', required: true },
  { table: 'perspective_generation_jobs', required: true },
  { table: 'perspective_feedback', required: true },
  { table: 'watchlist_activity_state', required: true },
  { table: 'news_items', required: true },
  { table: 'broker_reports', required: true },
  { table: 'user_research_artifact_links', required: true },
] as const;

export function evaluateWatchlistRlsObservation(
  observation: WatchlistRlsObservation,
): WatchlistRlsCanaryResult {
  const coverage = observation.accountAOwn && observation.accountBOwn
    ? 'full'
    : observation.accountAOwn
      ? 'account-a-only'
      : observation.accountBOwn ? 'account-b-only' : 'none';
  if (observation.accountAReadsB || observation.accountBReadsA) {
    return { ...observation, coverage, ok: false, detail: 'cross_tenant_read' };
  }
  if (observation.required && coverage !== 'full') {
    return { ...observation, coverage, ok: false, detail: 'required_fixture_missing' };
  }
  return { ...observation, coverage, ok: true };
}

export function watchlistRlsCanaryPassed(results: WatchlistRlsCanaryResult[]): boolean {
  return results.length === WATCHLIST_RLS_TABLES.length && results.every((result) => result.ok);
}
