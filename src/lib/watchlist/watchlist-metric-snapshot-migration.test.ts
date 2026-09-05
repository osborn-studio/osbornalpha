import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904260000_watchlist_metric_snapshots.sql', import.meta.url),
  'utf8',
);

describe('Watchlist metric snapshot migration', () => {
  it('separates last-known-good data from refresh state and scopes user reads', () => {
    expect(migration).toContain('create table if not exists public.watchlist_metric_snapshots');
    expect(migration).toContain('create table if not exists public.watchlist_metric_refresh_state');
    expect(migration).toContain('watchlist_metric_snapshots_followed_select');
    expect(migration).toContain('item.user_id = auth.uid()');
    expect(migration).toContain("primary key (ticker, history_range, benchmark_ticker)");
    expect(migration).toContain("values ('watchlist_metric_snapshots')");
  });

  it('claims bounded work atomically with expiring leases', () => {
    expect(migration).toContain('create or replace function public.claim_watchlist_metric_refresh');
    expect(migration).toContain('for update of state skip locked');
    expect(migration).toContain('if coalesce(p_limit, 10) = 0 then return; end if;');
    expect(migration).toContain("set status = 'running'");
    expect(migration).toContain('lease_expires_at = now() + make_interval');
    expect(migration).toContain('to service_role');
  });

  it('enqueues new Watchlist items without granting queue access to users', () => {
    expect(migration).toContain('create trigger watchlist_metric_refresh_on_item_insert');
    expect(migration).toContain('revoke all on table public.watchlist_metric_refresh_state from anon, authenticated');
  });
});
