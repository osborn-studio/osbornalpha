import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../../supabase/migrations/20260904500000_watchlist_alert_summaries.sql', import.meta.url), 'utf8');

describe('Watchlist alert summaries migration', () => {
  it('aggregates only authenticated user items without multiplying joins', () => {
    expect(migration).toContain('function public.get_watchlist_alert_summaries');
    expect(migration).toContain('where wi.user_id = auth.uid()');
    expect(migration).toContain('rule_counts as');
    expect(migration).toContain('event_counts as');
  });

  it('publishes a release marker', () => {
    expect(migration).toContain("values ('watchlist_alert_summaries')");
  });
});
