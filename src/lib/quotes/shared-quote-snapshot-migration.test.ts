import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904265000_shared_quote_snapshots.sql', import.meta.url),
  'utf8',
);

describe('shared quote snapshot migration', () => {
  it('keeps cross-instance quotes service-only with explicit freshness bounds', () => {
    expect(migration).toContain('create table if not exists public.market_quote_snapshots');
    expect(migration).toContain('stale_until timestamptz not null');
    expect(migration).toContain('change_pct numeric');
    expect(migration).toContain('open_price numeric');
    expect(migration).toContain('high_price numeric');
    expect(migration).toContain('low_price numeric');
    expect(migration).toContain('previous_close numeric');
    expect(migration).toContain('amount numeric');
    expect(migration).toContain('check (stale_until >= valid_until)');
    expect(migration).toContain('revoke all on table public.market_quote_snapshots from anon, authenticated');
    expect(migration).toContain("values ('shared_quote_snapshots')");
  });
});
