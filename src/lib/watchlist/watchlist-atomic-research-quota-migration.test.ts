import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904370000_watchlist_atomic_research_quota.sql', import.meta.url),
  'utf8',
);

describe('Watchlist atomic research authorization migration', () => {
  it('authorizes both quotas in one transaction and compensates before returning', () => {
    expect(migration).toContain('create or replace function public.authorize_watchlist_research_refresh()');
    expect(migration).toContain('public.consume_watchlist_research_quota()');
    expect(migration).toContain('public.consume_external_evidence_user_quota(30, 3600)');
    expect(migration).toContain('set used = greatest(used - 1, 0)');
    expect(migration).toContain("jsonb_build_object('allowed', false, 'reason', 'rate_limit')");
  });

  it('is user-only and has a production release marker', () => {
    expect(migration).toContain('grant execute on function public.authorize_watchlist_research_refresh() to authenticated');
    expect(migration).toContain("values ('watchlist_atomic_research_quota')");
  });
});
