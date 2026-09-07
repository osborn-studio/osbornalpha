import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904600000_watchlist_cron_dispatch_slots.sql',
  import.meta.url,
), 'utf8');
const pgTap = readFileSync(new URL(
  '../../../supabase/tests/watchlist_cron_dispatch_slots.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist cron dispatch slots migration', () => {
  it('keeps the scheduler ledger service-only', () => {
    expect(migration).toContain('alter table public.watchlist_cron_dispatch_slots enable row level security');
    expect(migration).toContain('revoke all on table public.watchlist_cron_dispatch_slots from anon, authenticated');
    expect(migration).toContain("auth.role() <> 'service_role'");
  });

  it('claims bounded missed slots atomically with leases and retry limits', () => {
    expect(migration).toContain("date_bin('15 minutes'");
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('dispatch.attempt_count < dispatch.max_attempts');
    expect(migration).toContain("status = 'running'");
    expect(migration).toContain('lease_token = gen_random_uuid()');
  });

  it('finishes only the lease owner and retains a release marker', () => {
    expect(migration).toContain('and lease_token = p_lease_token');
    expect(migration).toContain("when attempt_count >= max_attempts then 'dead_letter'");
    expect(migration).toContain("values ('watchlist_cron_dispatch_slots')");
    expect(migration).toContain('get_watchlist_cron_dispatch_health');
  });

  it('keeps the pgTAP assertion plan in sync with the scheduler coverage', () => {
    const assertions = pgTap.match(/^select (?:has_table|has_function|is|ok|throws_ok|lives_ok)\(/gm) ?? [];
    expect(pgTap).toContain(`select plan(${assertions.length});`);
  });
});
