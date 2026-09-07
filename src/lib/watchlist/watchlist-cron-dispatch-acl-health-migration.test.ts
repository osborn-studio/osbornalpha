import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904630000_watchlist_cron_dispatch_acl_health.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist cron dispatch ACL health migration', () => {
  it('publishes only the scheduler ACL matrix to the service role', () => {
    expect(migration).toContain('get_watchlist_cron_dispatch_acl_health');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('has_function_privilege');
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain('to service_role');
  });

  it('publishes the production release marker', () => {
    expect(migration).toContain("values ('watchlist_cron_dispatch_acl_health')");
  });
});
