import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904090000_watchlist_decision_sync.sql', import.meta.url),
  'utf8',
);

describe('watchlist decision and atomic sync migration', () => {
  it('adds the decision fields and user alert model', () => {
    expect(migration).toContain('add column if not exists thesis text');
    expect(migration).toContain('add column if not exists invalidation_conditions text');
    expect(migration).toContain('create table if not exists public.watchlist_alerts');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('create table if not exists public.watchlist_alert_events');
    expect(migration).toContain('create or replace function public.claim_watchlist_alert_events');
    expect(migration).toContain('create table if not exists public.watchlist_alert_runs');
    expect(migration).toContain('create or replace function public.watchlist_alert_research_candidates');
  });

  it('updates decisions atomically with optimistic locking and history', () => {
    expect(migration).toContain('add column if not exists decision_version integer');
    expect(migration).toContain('create table if not exists public.watchlist_item_decision_history');
    expect(migration).toContain('create or replace function public.update_watchlist_item_decision');
    expect(migration).toContain("message = 'watchlist_decision_conflict'");
    expect(migration).toContain('for update;');
    expect(migration).toContain('insert into public.watchlist_item_decision_history');
  });

  it('serializes snapshot mutations behind a per-user version lock', () => {
    expect(migration).toContain('create table if not exists public.watchlist_sync_state');
    expect(migration).toContain('create or replace function public.replace_watchlist_snapshot');
    expect(migration).toContain('for update;');
    expect(migration).toContain("message = 'watchlist_version_conflict'");
  });

  it('preserves item metadata when only structure or ordering changes', () => {
    expect(migration).toMatch(/on conflict \(watchlist_id, ticker\) do update[\s\S]+sort_order = excluded\.sort_order/);
    expect(migration).not.toMatch(/on conflict \(watchlist_id, ticker\) do update[\s\S]+thesis = excluded\.thesis/);
    expect(migration).toContain('select wi.* into v_prior_item');
    expect(migration).toContain('v_prior_item.thesis');
    expect(migration).toContain('set watchlist_id = v_group_id');
  });

  it('aggregates research independently for each requested ticker', () => {
    expect(migration).toContain('create or replace function public.watchlist_research_summaries');
    expect(migration).toContain("count(*) filter (where n.published_at >= now() - interval '14 days')");
    expect(migration).toContain('group by n.ticker');
    expect(migration).toContain('grant execute on function public.watchlist_research_summaries(text[]) to authenticated');
  });
});
