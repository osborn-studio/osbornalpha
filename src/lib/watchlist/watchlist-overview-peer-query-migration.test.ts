import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904490000_watchlist_overview_peer_query.sql', import.meta.url),
  'utf8',
);

describe('Watchlist overview peer query migration', () => {
  it('reuses the peer RPC and publishes every peer-backed sort key', () => {
    expect(migration).toContain('select * from public.get_watchlist_peer_metrics(p_history_range)');
    expect(migration).toContain('left join peer on peer.ticker = wi.ticker');
    for (const key of [
      'relativeStrengthRank', 'pePercentile', 'pbPercentile',
      'liquidityPercentile', 'averageTradedAmount20', 'marketCapShare',
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
  });

  it('applies the same minimum sample rule used by the API envelope', () => {
    expect(migration).toContain('peer.market_relative_strength_sample_size >= 5');
    expect(migration).toContain('peer.industry_pe_sample_size >= 5');
    expect(migration).toContain('peer.industry_pb_sample_size >= 5');
    expect(migration).toContain('peer.market_liquidity_sample_size >= 5');
    expect(migration).toContain("values ('watchlist_overview_peer_query')");
  });

  it('keeps fixed allowlists and authenticated ownership boundaries', () => {
    expect(migration).toContain('wi.user_id = auth.uid()');
    expect(migration).toContain('wl.user_id = auth.uid()');
    expect(migration).toContain('security definer');
    expect(migration).not.toContain('execute format');
  });

  it('rejects cross-market currency comparisons and returns query provenance', () => {
    expect(migration).toContain("raise exception 'watchlist_single_market_required'");
    expect(migration).toContain("'macdHistogram', 'averageTradedAmount20'");
    expect(migration).toContain("'querySnapshot', jsonb_build_object(");
    expect(migration).toContain("'sortNumber', sort_num");
    expect(migration).toContain("'sortAsOf', sort_as_of");
    expect(migration).toContain("'metricNumber', metric_num");
  });
});
