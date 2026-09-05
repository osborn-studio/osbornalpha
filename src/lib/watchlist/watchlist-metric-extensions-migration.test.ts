import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904440000_watchlist_metric_extensions.sql', import.meta.url),
  'utf8',
);

describe('Watchlist metric extensions migration', () => {
  it('upgrades existing snapshots idempotently and publishes a release marker', () => {
    expect(migration).toContain('add column if not exists excess_return_pct numeric');
    expect(migration).toContain('add column if not exists beta numeric');
    expect(migration).toContain('add column if not exists volume_zscore_20 numeric');
    expect(migration).toContain("values ('watchlist_metric_extensions')");
  });

  it('adds query indexes for every promoted metric', () => {
    expect(migration).toContain('watchlist_metric_snapshots_excess_return_idx');
    expect(migration).toContain('watchlist_metric_snapshots_beta_idx');
    expect(migration).toContain('watchlist_metric_snapshots_volume_zscore_idx');
  });
});
