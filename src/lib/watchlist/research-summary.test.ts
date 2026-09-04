import { describe, expect, it } from 'vitest';
import { summarizeWatchlistResearch } from './research-summary';

describe('watchlist research summary', () => {
  it('summarizes only the requested ticker and exposes perspective divergence', () => {
    const summary = summarizeWatchlistResearch({
      ticker: 'AAPL',
      now: new Date('2026-09-04T00:00:00Z'),
      news: [
        { ticker: 'AAPL', published_at: '2026-09-03T00:00:00Z', sentiment: 0.8 },
        { ticker: 'AAPL', published_at: '2026-08-01T00:00:00Z', sentiment: -1 },
        { ticker: 'NVDA', published_at: '2026-09-03T00:00:00Z', sentiment: -1 },
      ],
      reports: [{ ticker: 'AAPL', published_at: '2026-09-02' }],
      perspectives: [
        { ticker: 'AAPL', stance: 'bullish', created_at: '2026-09-03T01:00:00Z' },
        { ticker: 'AAPL', stance: 'bearish', created_at: '2026-09-03T02:00:00Z' },
      ],
    });
    expect(summary).toMatchObject({ recentNewsCount: 1, averageSentiment: 0.8, perspectiveDivergence: true });
    expect(summary.perspectiveCounts).toEqual({ bullish: 1, neutral: 0, bearish: 1 });
  });
});
