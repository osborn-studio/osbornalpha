import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904350000_watchlist_activity_feedback_hardening.sql', import.meta.url),
  'utf8',
);

describe('Watchlist activity and feedback hardening migration', () => {
  it('keeps activity state user-scoped and tied to watchlist ownership', () => {
    expect(migration).toContain('create table if not exists public.watchlist_activity_state');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('where wi.user_id = auth.uid() and wi.ticker = watchlist_activity_state.ticker');
    expect(migration).toContain('grant select, insert, update, delete on public.watchlist_activity_state to authenticated');
  });

  it('makes failed perspective evaluations terminal and service-only', () => {
    expect(migration).toContain("check (status in ('pending', 'dead_letter'))");
    expect(migration).toContain("where q.status = 'pending'");
    expect(migration).toContain('and q.attempt_count < 5');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('grant execute on function public.claim_perspective_evaluations(integer) to service_role');
  });

  it('adds quota compensation and a release marker', () => {
    expect(migration).toContain('create or replace function public.refund_watchlist_research_quota()');
    expect(migration).toContain('set used = greatest(used - 1, 0)');
    expect(migration).toContain("values ('watchlist_activity_feedback_hardening')");
  });
});
