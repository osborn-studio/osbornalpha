import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904120000_watchlist_alert_constraints.sql', import.meta.url),
  'utf8',
);

describe('watchlist alert constraint migration', () => {
  it('aligns numeric, discrete, and configuration shapes with the API contract', () => {
    expect(migration).toContain('watchlist_alerts_rule_shape_check');
    expect(migration).toContain("alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation')");
    expect(migration).toContain('operator is not null');
    expect(migration).toContain('threshold_numeric is not null');
    expect(migration).toContain("alert_type in ('event', 'rating', 'perspective')");
    expect(migration).toContain('operator is null');
    expect(migration).toContain("config ->> 'metric' in ('pe_ttm', 'pb')");
  });
});
