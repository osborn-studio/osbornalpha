import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260904510000_watchlist_provider_health.sql', 'utf8');

describe('Watchlist provider health migration', () => {
  it('keeps raw health private and exposes sanitized authenticated reads', () => {
    expect(migration).toContain('alter table public.watchlist_provider_health enable row level security');
    expect(migration).toContain('revoke all on table public.watchlist_provider_health from anon, authenticated');
    expect(migration).toContain('grant execute on function public.get_watchlist_provider_health() to authenticated, service_role');
  });

  it('records consecutive failures and opens a bounded backoff circuit', () => {
    expect(migration).toContain("public.watchlist_provider_health.consecutive_failures + 1 >= 3");
    expect(migration).toContain("then 'open'");
    expect(migration).toContain('least(\n            360,');
  });
});
