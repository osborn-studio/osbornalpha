import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904390000_watchlist_review_workflow.sql',
  import.meta.url,
), 'utf8');

describe('watchlist review workflow migration', () => {
  it('derives review state without a parallel status table', () => {
    expect(migration).toContain('get_watchlist_review_queue');
    expect(migration).toContain("status not in ('paused', 'invalidated')");
    expect(migration).toContain("when wi.review_at is null then 'unscheduled'");
    expect(migration).not.toContain('create table public.watchlist_review');
  });

  it('uses user scope, timezone and a release marker', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('pg_timezone_names');
    expect(migration).toContain("values ('watchlist_review_workflow')");
  });
});
