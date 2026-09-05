import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904280000_watchlist_alert_scopes.sql', import.meta.url),
  'utf8',
);

describe('Watchlist alert scope migration', () => {
  it('records scope and closed-market skips', () => {
    expect(migration).toContain("add column if not exists scope text not null default 'all'");
    expect(migration).toContain('add column if not exists skipped_closed integer not null default 0');
    expect(migration).toContain("scope in ('all', 'quote', 'research')");
  });

  it('locks and expires runs independently by scope', () => {
    expect(migration).toContain("hashtext('watchlist-alert-runner:' || v_scope)");
    expect(migration).toContain('and scope = v_scope');
    expect(migration).toContain('where status = \'running\' and scope = v_scope');
    expect(migration).toContain('to service_role');
  });
});
