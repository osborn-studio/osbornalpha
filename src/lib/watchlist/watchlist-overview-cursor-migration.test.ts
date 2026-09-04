import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904170000_watchlist_overview_cursor.sql', import.meta.url),
  'utf8',
);

describe('watchlist overview cursor migration', () => {
  it('uses a stable authenticated keyset and fetches one sentinel row', () => {
    expect(migration).toContain('create or replace function public.get_watchlist_overview_cursor');
    expect(migration).toContain('wi.user_id = auth.uid()');
    expect(migration).toContain('wl.user_id = auth.uid()');
    expect(migration).toContain('all_rows as materialized');
    expect(migration).toContain('(group_sort, item_sort, item_id) > (p_group_sort, p_item_sort, p_item_id)');
    expect(migration).toContain('page_limit + 1');
    expect(migration).toContain("'next_cursor'");
    expect(migration).toContain('to authenticated');
  });
});
