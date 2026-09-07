import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904450000_watchlist_peer_metrics.sql', import.meta.url),
  'utf8',
);

describe('Watchlist peer metrics migration', () => {
  it('persists provider-reported average traded amount and exposes an authenticated RPC', () => {
    expect(migration).toContain('add column if not exists average_traded_amount_20 numeric');
    expect(migration).toContain('function public.get_watchlist_peer_metrics');
    expect(migration).toContain("if auth.uid() is null then raise exception 'watchlist_auth_required'");
    expect(migration).toContain('grant execute on function public.get_watchlist_peer_metrics(text) to authenticated');
    expect(migration).toContain('grant execute on function public.get_watchlist_peer_metrics_for_user(uuid, text) to service_role');
  });

  it('uses complete market and industry pools instead of the current page', () => {
    expect(migration).toContain('from public.stocks_universe stock');
    expect(migration).toContain('partition by u.market order by u.period_return_pct');
    expect(migration).toContain('partition by u.market, u.industry order by u.pe_ttm');
    expect(migration).toContain('partition by u.market order by u.average_traded_amount_20');
  });

  it('keeps market-cap composition within a comparable market and currency', () => {
    expect(migration).toContain('partition by watched.market, watched.currency');
    expect(migration).toContain("values ('watchlist_peer_metrics')");
  });
});
