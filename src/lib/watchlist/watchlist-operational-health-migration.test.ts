import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904340000_watchlist_operational_health.sql', import.meta.url),
  'utf8',
);

describe('Watchlist operational health migration', () => {
  it('aggregates queues, snapshot age, alert delay, citations, and shared research', () => {
    expect(migration).toContain('create or replace function public.get_watchlist_operational_health()');
    expect(migration).toContain('watchlist_research_ticker_refresh_state');
    expect(migration).toContain('watchlist_metric_refresh_state');
    expect(migration).toContain('market_quote_snapshots');
    expect(migration).toContain('watchlist_metric_snapshots');
    expect(migration).toContain('watchlist_alert_events');
    expect(migration).toContain('evidence_coverage_ratio');
    expect(migration).toContain('shared_research_artifacts');
  });

  it('is restricted to service-role callers', () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('revoke all on function public.get_watchlist_operational_health() from public');
    expect(migration).toContain('grant execute on function public.get_watchlist_operational_health() to service_role');
    expect(migration).toContain("values ('watchlist_operational_health')");
  });
});
