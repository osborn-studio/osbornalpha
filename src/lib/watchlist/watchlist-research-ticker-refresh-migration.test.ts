import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904140000_watchlist_research_ticker_refresh.sql', import.meta.url),
  'utf8',
);

describe('watchlist ticker research refresh migration', () => {
  it('leases distinct tickers instead of user and ticker pairs', () => {
    expect(migration).toContain('watchlist_research_ticker_refresh_state');
    expect(migration).toContain('select distinct wi.ticker');
    expect(migration).toContain('claim_watchlist_research_ticker_refresh');
    expect(migration).toContain('for update of state skip locked');
    expect(migration).toContain('grant execute on function public.claim_watchlist_research_ticker_refresh(integer, integer) to service_role');
  });
});
