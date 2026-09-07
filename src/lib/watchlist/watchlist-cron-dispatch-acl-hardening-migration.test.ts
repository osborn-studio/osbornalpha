import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904620000_watchlist_cron_dispatch_acl_hardening.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist cron dispatch ACL hardening migration', () => {
  it('removes legacy public RPC grants and retains only service-role execution', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('claim_watchlist_cron_dispatch_slots');
    expect(migration).toContain('finish_watchlist_cron_dispatch_slot');
    expect(migration).toContain('cleanup_watchlist_cron_dispatch_slots');
    expect(migration).toContain('get_watchlist_cron_dispatch_health');
    expect(migration).toContain('to service_role');
  });

  it('publishes the release marker required by production schema checks', () => {
    expect(migration).toContain("values ('watchlist_cron_dispatch_acl_hardening')");
  });
});
