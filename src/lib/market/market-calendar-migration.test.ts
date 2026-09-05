import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904290000_market_calendar_overrides.sql', import.meta.url),
  'utf8',
);

describe('market calendar override migration', () => {
  it('stores normalized exchange exceptions behind the service role', () => {
    expect(migration).toContain('create table if not exists public.market_calendar_overrides');
    expect(migration).toContain("kind in ('closed', 'sessions')");
    expect(migration).toContain('primary key (market, date_key)');
    expect(migration).toContain('revoke all on table public.market_calendar_overrides from anon, authenticated');
    expect(migration).toContain('create or replace function public.replace_market_calendar_overrides');
    expect(migration).toContain('security definer');
    expect(migration).toContain('delete from public.market_calendar_overrides existing');
    expect(migration).toContain('existing.date_key between p_from and p_to');
    expect(migration).toContain('not exists (');
    expect(migration).toContain('on conflict (market, date_key) do update');
    expect(migration).toContain('revoke all on function public.replace_market_calendar_overrides');
    expect(migration).toContain('grant execute on function public.replace_market_calendar_overrides(jsonb, text, date, date, text[]) to service_role');
    expect(migration).toContain("values ('market_calendar_overrides')");
  });
});
