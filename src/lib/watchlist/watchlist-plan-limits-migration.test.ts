import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904330000_watchlist_plan_limits.sql', import.meta.url),
  'utf8',
);

describe('Watchlist plan limits migration', () => {
  it('enforces resource capacity and atomically consumes research usage', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("message = 'watchlist_item_plan_limit'");
    expect(migration).toContain("message = 'watchlist_alert_plan_limit'");
    expect(migration).toContain('for update;');
    expect(migration).toContain('create or replace function public.consume_watchlist_research_quota()');
    expect(migration).toContain('grant execute on function public.consume_watchlist_research_quota() to authenticated');
    expect(migration).toContain("values ('watchlist_plan_limits')");
  });
});
