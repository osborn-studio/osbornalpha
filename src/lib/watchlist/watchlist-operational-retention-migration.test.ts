import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904580000_watchlist_operational_retention.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist operational retention migration', () => {
  it('cleans only terminal jobs and bounded evidence audit history', () => {
    expect(migration).toContain("status in ('succeeded', 'failed', 'cancelled')");
    expect(migration).toContain('delete from public.watchlist_research_jobs');
    expect(migration).toContain('delete from public.perspective_generation_jobs');
    expect(migration).toContain('delete from public.external_evidence_runs');
    expect(migration).toContain('limit v_limit');
  });

  it('is service-role-only and supports a no-op production probe', () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain('if v_limit = 0 then');
    expect(migration).toContain("values ('watchlist_operational_retention')");
  });
});
