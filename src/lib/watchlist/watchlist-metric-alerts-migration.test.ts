import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904410000_watchlist_metric_alerts.sql', import.meta.url),
  'utf8',
);

describe('Watchlist metric alerts migration', () => {
  it('extends alert rules, run scopes, and portable imports together', () => {
    expect(migration).toContain("'price', 'change_pct', 'volume_ratio', 'valuation', 'metric', 'event'");
    expect(migration).toContain("scope in ('all', 'quote', 'metric', 'research')");
    expect(migration).toContain("config ->> 'metric' in (");
    expect(migration).toContain("'rsi14'");
    expect(migration).toContain("'macd_histogram'");
    expect(migration).toContain("v_alert_import.alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation', 'metric')");
    expect(migration).toContain("values ('watchlist_metric_alerts')");
  });
});
