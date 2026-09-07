import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904590000_watchlist_bulk_workflow_runs.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist bulk workflow run migration', () => {
  it('keeps user commands private and exposes only owned run records', () => {
    expect(migration).toContain('alter table public.watchlist_bulk_workflow_runs enable row level security');
    expect(migration).toContain('using (auth.uid() = user_id)');
    expect(migration).toContain('revoke all on table public.watchlist_bulk_workflow_runs from anon, authenticated');
  });

  it('serializes request ids and supports replay, conflict detection, and expired lease recovery', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("'state', 'replay'");
    expect(migration).toContain("'state', 'conflict'");
    expect(migration).toContain("'state', 'in_progress'");
    expect(migration).toContain('v_run.lease_expires_at > now()');
  });

  it('bounds stored results and provides service-role retention', () => {
    expect(migration).toContain('octet_length(result::text) <= 262144');
    expect(migration).toContain('cleanup_watchlist_bulk_workflow_runs');
    expect(migration).toContain("values ('watchlist_bulk_workflow_runs')");
  });
});
