import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Watchlist review reminder migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260904400000_watchlist_review_reminders.sql',
  ), 'utf8');

  it('adds idempotent system events without creating a second delivery queue', () => {
    expect(sql).toContain('alter column alert_id drop not null');
    expect(sql).toContain('watchlist_alert_events_system_key_idx');
    expect(sql).toContain('enqueue_watchlist_review_reminders');
    expect(sql).toContain("'review:' || due.review_date::text");
    expect(sql).toContain('on conflict do nothing');
    expect(sql).not.toContain('create table');
  });

  it('keeps disabled decision statuses out and restricts execution to service role', () => {
    expect(sql).toContain("item.status not in ('paused', 'invalidated')");
    expect(sql).toContain('grant execute on function public.enqueue_watchlist_review_reminders(integer) to service_role');
    expect(sql).toContain("values ('watchlist_review_reminders')");
  });
});
