import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904190000_watchlist_research_refresh_cleanup.sql', import.meta.url),
  'utf8',
);

describe('watchlist research refresh cleanup migration', () => {
  it('backfills the ticker queue and releases stale legacy leases', () => {
    expect(migration).toContain('insert into public.watchlist_research_ticker_refresh_state');
    expect(migration).toContain('on conflict (ticker) do nothing');
    expect(migration).toContain("superseded_by_ticker_refresh");
    expect(migration).toContain("where status = 'running'");
  });
});
