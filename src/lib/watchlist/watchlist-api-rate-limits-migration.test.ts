import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904610000_watchlist_api_rate_limits.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist API rate limit migration', () => {
  it('keeps counters private and derives identity from auth', () => {
    expect(migration).toContain('alter table public.watchlist_api_rate_limits enable row level security');
    expect(migration).toContain('revoke all on table public.watchlist_api_rate_limits from anon, authenticated');
    expect(migration).toContain('v_user_id uuid := auth.uid()');
  });

  it('owns immutable action limits inside the database function', () => {
    expect(migration).toContain("when 'import' then v_limit := 6; v_window_seconds := 600");
    expect(migration).toContain('on conflict (user_id, action) do update');
    expect(migration).toContain("grant execute on function public.consume_watchlist_api_rate_limit(text) to authenticated");
  });

  it('provides bounded service retention and a release marker', () => {
    expect(migration).toContain('cleanup_watchlist_api_rate_limits');
    expect(migration).toContain("values ('watchlist_api_rate_limits')");
  });
});
