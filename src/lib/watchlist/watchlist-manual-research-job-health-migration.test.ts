import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904560000_watchlist_manual_research_job_health.sql', import.meta.url),
  'utf8',
);

describe('Watchlist manual research job health migration', () => {
  it('extends the existing operational RPC with bounded manual-job counters', () => {
    expect(migration).toContain('create or replace function public.get_watchlist_operational_health()');
    expect(migration).toContain("'manual_research_jobs', jsonb_build_object(");
    expect(migration).toContain("status = 'failed' and finished_at >= now() - interval '24 hours'");
    expect(migration).toContain("status = 'cancelled' and finished_at >= now() - interval '24 hours'");
    expect(migration).toContain("values ('watchlist_manual_research_job_health')");
  });

  it('preserves the service-role boundary', () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('revoke all on function public.get_watchlist_operational_health() from public');
    expect(migration).toContain('grant execute on function public.get_watchlist_operational_health() to service_role');
  });
});
