import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904266000_shared_research_artifacts.sql', import.meta.url),
  'utf8',
);

describe('shared research artifact migration', () => {
  it('deduplicates public artifacts and keeps user access in a narrow link table', () => {
    expect(migration).toContain('create table if not exists public.shared_research_artifacts');
    expect(migration).toContain("unique (kind, ticker, source_key)");
    expect(migration).toContain('create table if not exists public.user_research_artifact_links');
    expect(migration).toContain('primary key (user_id, artifact_id)');
    expect(migration).toContain('insert into public.shared_research_artifacts');
    expect(migration).toContain('insert into public.user_research_artifact_links');
  });

  it('allows writes only through the service-role RPC and prevents stale overwrites', () => {
    expect(migration).toContain('create or replace function public.persist_shared_research_artifacts');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('where excluded.fetched_at >= shared_research_artifacts.fetched_at');
    expect(migration).toContain('revoke all on function public.persist_shared_research_artifacts');
    expect(migration).toContain('to service_role');
  });

  it('checks caller identity when loading linked research', () => {
    expect(migration).toContain('create or replace function public.load_watchlist_research_artifacts');
    expect(migration).toContain('auth.uid() is distinct from p_user_id');
    expect(migration).toContain('link.user_id = p_user_id');
    expect(migration).toContain("values ('shared_research_artifacts')");
  });
});
