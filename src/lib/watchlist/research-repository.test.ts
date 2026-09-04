import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistResearchSummaries } from './research-repository';

describe('loadWatchlistResearchSummaries', () => {
  it('maps database aggregates without another in-memory global limit', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        ticker: 'AAPL', recent_news_count: 4, latest_news_at: '2026-09-04T00:00:00Z',
        average_sentiment: 0.25, latest_report_at: '2026-09-03T00:00:00Z',
        sentiment_sample_size: 3, sentiment_coverage_ratio: 0.75,
        bullish_count: 2, neutral_count: 1, bearish_count: 1,
        latest_perspective_at: '2026-09-04T01:00:00Z',
      }],
      error: null,
    }));
    const result = await loadWatchlistResearchSummaries({ rpc } as never, ['AAPL']);
    expect(rpc).toHaveBeenCalledWith('watchlist_research_summaries', { p_tickers: ['AAPL'] });
    expect(result.AAPL).toMatchObject({
      recentNewsCount: 4,
      averageSentiment: 0.25,
      sentimentSampleSize: 3,
      sentimentCoverageRatio: 0.75,
      perspectiveCounts: { bullish: 2, neutral: 1, bearish: 1 },
      perspectiveDivergence: true,
    });
  });

  it('fails loudly when the aggregate query fails', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: 'database offline' } })) };
    await expect(loadWatchlistResearchSummaries(client as never, ['AAPL']))
      .rejects.toThrow('watchlist_research_summary_failed:database offline');
  });

  it('normalizes malformed aggregate numbers before exposing them to the UI', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        ticker: 'AAPL', recent_news_count: 'NaN', latest_news_at: null,
        average_sentiment: 4, sentiment_sample_size: -2, sentiment_coverage_ratio: 'Infinity',
        latest_report_at: null, bullish_count: 1, neutral_count: 0, bearish_count: 0,
        latest_perspective_at: null,
      }],
      error: null,
    }));
    const result = await loadWatchlistResearchSummaries({ rpc } as never, ['AAPL']);
    expect(result.AAPL).toMatchObject({
      recentNewsCount: 0,
      averageSentiment: 1,
      sentimentSampleSize: 0,
      sentimentCoverageRatio: 0,
    });
  });
});
