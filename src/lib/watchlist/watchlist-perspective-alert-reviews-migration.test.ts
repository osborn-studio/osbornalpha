import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904540000_watchlist_perspective_alert_reviews.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('Perspective alert review migration', () => {
  it('keeps claim provenance outside alert config and forces drafts disabled', () => {
    expect(migration).toContain('create table if not exists public.watchlist_alert_origins');
    expect(migration).toContain('create_watchlist_alert_draft_from_claim');
    expect(migration).toContain('v_config, false, p_cooldown_minutes');
    expect(migration).toContain('grant select on public.watchlist_alert_origins to authenticated');
    expect(migration).toContain('revoke insert, update, delete on public.watchlist_alert_origins');
  });

  it('atomically derives review reasons from inserted triggered events', () => {
    expect(migration).toContain('create table if not exists public.watchlist_review_reasons');
    expect(migration).toContain('after insert on public.watchlist_alert_events');
    expect(migration).toContain("new.delivery_status <> 'pending'");
    expect(migration).toContain('from public.watchlist_alert_origins origin');
    expect(migration).toContain('grant select on public.watchlist_review_reasons to authenticated');
  });

  it('resolves or snoozes reasons through the versioned review action', () => {
    expect(migration).toContain('create or replace function public.act_watchlist_review');
    expect(migration).toContain('from public.update_watchlist_item_decision');
    expect(migration).toContain('set resolved_at = now()');
    expect(migration).toContain('set snoozed_until = p_review_at');
    expect(migration).toContain("'review_reasons', row.review_reasons");
  });
});
