import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistPeerMetrics } from './peer-metrics-repository';

const peerRow = {
  ticker: 'AAPL', market: 'US' as const, currency: 'USD', industry: 'Technology',
  market_relative_strength_percentile: 80, market_relative_strength_sample_size: 20,
  industry_pe_percentile: 50, industry_pe_sample_size: 10,
  industry_pb_percentile: 60, industry_pb_sample_size: 10,
  market_liquidity_percentile: 90, market_liquidity_sample_size: 20,
  average_traded_amount_20: 1_000_000, watchlist_market_cap_share_pct: 100,
  watchlist_market_cap_sample_size: 1, as_of: new Date().toISOString(),
};

describe('loadWatchlistPeerMetrics', () => {
  it('loads once for the complete user watchlist and returns only requested tickers', async () => {
    const rpc = vi.fn(async () => ({ data: [peerRow, { ...peerRow, ticker: 'MSFT' }], error: null }));
    const result = await loadWatchlistPeerMetrics({ rpc }, ['AAPL', 'AAPL'], '6m');
    expect(rpc).toHaveBeenCalledWith('get_watchlist_peer_metrics', { p_history_range: '6m' });
    expect(Object.keys(result)).toEqual(['AAPL']);
  });

  it('does not call the database for an empty page and exposes repository failures', async () => {
    const rpc = vi.fn();
    await expect(loadWatchlistPeerMetrics({ rpc }, [])).resolves.toEqual({});
    expect(rpc).not.toHaveBeenCalled();
    await expect(loadWatchlistPeerMetrics({ rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) }, ['AAPL']))
      .rejects.toThrow('watchlist_peer_metrics_load_failed:boom');
  });
});
