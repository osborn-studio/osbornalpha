import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904360000_watchlist_operational_monitoring.sql', import.meta.url),
  'utf8',
);

describe('Watchlist operational monitoring migration', () => {
  it('adds a deduplicated service-alert history stream for Watchlist health', () => {
    expect(migration).toContain("'watchlist_15m'");
    expect(migration).toContain('service_alert_runs_check_name_check');
    expect(migration).toContain("values ('watchlist_operational_monitoring')");
  });
});
