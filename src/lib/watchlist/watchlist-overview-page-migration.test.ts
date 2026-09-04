import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904110000_watchlist_overview_page.sql', import.meta.url),
  'utf8',
);

describe('watchlist overview database pagination migration', () => {
  it('pages only authenticated user rows in stable group and item order', () => {
    expect(migration).toContain('create or replace function public.get_watchlist_overview_page');
    expect(migration).toContain('wi.user_id = auth.uid()');
    expect(migration).toContain('wl.user_id = auth.uid()');
    expect(migration).toContain('order by group_sort, item_sort, item_id');
    expect(migration).toContain('offset greatest(coalesce(p_offset, 0), 0)');
    expect(migration).toContain('limit least(greatest(coalesce(p_limit, 50), 1), 50)');
    expect(migration).toContain('grant execute on function public.get_watchlist_overview_page(integer, integer, text) to authenticated');
  });
});
