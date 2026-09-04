import type { Stance } from '@/lib/supabase/database.types';
import type { WatchlistServerClient } from './server-repository';
import type { WatchlistResearchSummary } from './research-summary';
import { WATCHLIST_RESEARCH_WINDOW_DAYS } from './research-window';

interface ResearchSummaryRow {
  ticker: string;
  recent_news_count: number;
  latest_news_at: string | null;
  average_sentiment: number | null;
  sentiment_sample_size?: number;
  sentiment_coverage_ratio?: number;
  latest_report_at: string | null;
  bullish_count: number;
  neutral_count: number;
  bearish_count: number;
  latest_perspective_at: string | null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function boundedRatio(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function boundedSentiment(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(-1, Math.min(1, parsed)) : null;
}

export async function loadWatchlistResearchSummaries(
  client: WatchlistServerClient,
  tickers: string[],
): Promise<Record<string, WatchlistResearchSummary>> {
  if (tickers.length === 0) return {};
  const repository = client as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: ResearchSummaryRow[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('watchlist_research_summaries', { p_tickers: tickers });
  if (error) throw new Error(`watchlist_research_summary_failed:${error.message}`);

  return Object.fromEntries((data ?? []).map((row) => {
    const perspectiveCounts: Record<Stance, number> = {
      bullish: count(row.bullish_count),
      neutral: count(row.neutral_count),
      bearish: count(row.bearish_count),
    };
    return [row.ticker, {
      recentNewsCount: count(row.recent_news_count),
      latestNewsAt: row.latest_news_at,
      latestReportAt: row.latest_report_at,
      averageSentiment: boundedSentiment(row.average_sentiment),
      sentimentSampleSize: count(row.sentiment_sample_size),
      sentimentCoverageRatio: boundedRatio(row.sentiment_coverage_ratio),
      perspectiveCounts,
      perspectiveDivergence: perspectiveCounts.bullish > 0 && perspectiveCounts.bearish > 0,
      latestPerspectiveAt: row.latest_perspective_at,
      researchWindowDays: WATCHLIST_RESEARCH_WINDOW_DAYS,
    } satisfies WatchlistResearchSummary];
  }));
}
