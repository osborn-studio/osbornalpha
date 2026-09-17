import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260917090000_watchlist_metric_refresh_market_cast.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Watchlist metric refresh market cast migration', () => {
  it('casts the market_t enum before calling the text-only benchmark helper', () => {
    expect(migration).toContain('create or replace function public.claim_watchlist_metric_refresh');
    expect(migration).toContain('stock.market::text');
    expect(migration).toContain('public.watchlist_default_benchmark(stock.market::text)');
    expect(migration).not.toContain('public.watchlist_default_benchmark(stock.market)');
  });

  it('keeps the lease claim and service_role grants intact', () => {
    expect(migration).toContain('for update of state skip locked');
    expect(migration).toContain("set status = 'running'");
    expect(migration).toContain('lease_expires_at = now() + make_interval');
    expect(migration).toContain(
      'grant execute on function public.claim_watchlist_metric_refresh(integer, integer) to service_role',
    );
  });
});
