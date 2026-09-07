import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904470000_watchlist_composition_metrics.sql', import.meta.url),
  'utf8',
);

describe('Watchlist composition metrics migration', () => {
  it('keeps composition user-scoped and correlations comparable', () => {
    expect(migration).toContain('where item.user_id = auth.uid()');
    expect(migration).toContain('left_item.market = right_item.market');
    expect(migration).toContain('left_item.currency = right_item.currency');
    expect(migration).toContain('having count(*) >= 20');
  });

  it('returns bounded arrays and publishes a release marker', () => {
    expect(migration).toContain('order by abs(correlation) desc limit 50');
    expect(migration).toContain("values ('watchlist_composition_metrics')");
  });
});
