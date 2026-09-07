import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260904520000_watchlist_composition_snapshots.sql', 'utf8');

describe('Watchlist composition snapshot migration', () => {
  it('moves pairwise calculation behind a service-role refresh boundary', () => {
    expect(migration).toContain('create or replace function public.calculate_watchlist_composition_metrics');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('create or replace function public.refresh_watchlist_composition_snapshots');
  });

  it('makes the interactive RPC a version-consistent snapshot read', () => {
    const readFunction = migration.slice(migration.indexOf('-- Preserve the existing application RPC name'));
    expect(readFunction).toContain('from public.watchlist_composition_snapshots snapshot');
    expect(readFunction).toContain('snapshot.watchlist_version = current_version');
    expect(readFunction).not.toContain('corr(');
    expect(migration).toContain('having count(*) >= 20');
    expect(migration).toContain('limit 50');
  });
});
