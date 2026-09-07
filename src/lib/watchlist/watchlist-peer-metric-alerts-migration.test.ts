import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904480000_watchlist_peer_metric_alerts.sql', import.meta.url),
  'utf8',
);

describe('Watchlist peer metric alerts migration', () => {
  it('keeps the database metric catalog aligned with the application registry', () => {
    for (const key of [
      'average_traded_amount_20',
      'market_relative_strength_percentile',
      'industry_pe_percentile',
      'industry_pb_percentile',
      'market_liquidity_percentile',
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain("values ('watchlist_peer_metric_alerts')");
  });

  it('bounds every percentile threshold to zero through one hundred', () => {
    expect(migration).toContain("or threshold_numeric >= 0");
    expect(migration).toContain("or threshold_numeric <= 100");
    expect(migration).toContain("'market_relative_strength_percentile', 'industry_pe_percentile'");
    expect(migration).toContain("'industry_pb_percentile', 'market_liquidity_percentile'");
  });
});
