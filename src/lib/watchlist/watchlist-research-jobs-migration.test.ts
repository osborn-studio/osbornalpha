import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260904530000_watchlist_research_jobs.sql', 'utf8');

describe('Watchlist research jobs migration', () => {
  it('enforces one active idempotent job before consuming quota', () => {
    expect(migration).toContain('watchlist_research_jobs_active_idx');
    const existing = migration.indexOf('select * into v_job from public.watchlist_research_jobs');
    const quota = migration.indexOf('public.authorize_watchlist_research_refresh()');
    expect(existing).toBeGreaterThan(0);
    expect(existing).toBeLessThan(quota);
  });

  it('keeps job mutation behind RPC and worker leases', () => {
    expect(migration).toContain('revoke all on table public.watchlist_research_jobs from anon, authenticated');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('lease_token = gen_random_uuid()');
  });
});
