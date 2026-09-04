import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(fileURLToPath(new URL('../../../supabase/migrations/20260904200000_watchlist_monitoring_status.sql', import.meta.url)), 'utf8');

describe('watchlist monitoring status migration', () => {
  it('excludes paused and invalidated items from ticker research claims', () => {
    expect(migration).toContain("where wi.status not in ('paused', 'invalidated')");
    expect(migration).toContain("and wi.status not in ('paused', 'invalidated')");
    expect(migration).toContain('watchlist_items_ticker_status_idx');
  });
});
