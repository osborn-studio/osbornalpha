import type { Stance } from '@/lib/supabase/database.types';

export interface ResearchSummaryInput {
  ticker: string;
  news: Array<{ ticker: string; published_at: string; sentiment: number | null }>;
  reports: Array<{ ticker: string; published_at: string | null }>;
  perspectives: Array<{ ticker: string; stance: Stance; created_at: string }>;
  now?: Date;
}

export interface WatchlistResearchSummary {
  recentNewsCount: number;
  latestNewsAt: string | null;
  latestReportAt: string | null;
  averageSentiment: number | null;
  perspectiveCounts: Record<Stance, number>;
  perspectiveDivergence: boolean;
  latestPerspectiveAt: string | null;
}

function latest(values: Array<string | null>): string | null {
  return values.filter((value): value is string => !!value).sort().at(-1) ?? null;
}

export function summarizeWatchlistResearch(input: ResearchSummaryInput): WatchlistResearchSummary {
  const cutoff = (input.now ?? new Date()).getTime() - 14 * 24 * 60 * 60 * 1000;
  const news = input.news.filter((row) => row.ticker === input.ticker);
  const recentNews = news.filter((row) => new Date(row.published_at).getTime() >= cutoff);
  const sentiments = recentNews
    .map((row) => row.sentiment)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const perspectives = input.perspectives.filter((row) => row.ticker === input.ticker);
  const perspectiveCounts: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 };
  perspectives.forEach((row) => { perspectiveCounts[row.stance] += 1; });
  const expressed = (['bullish', 'bearish'] as Stance[]).filter((stance) => perspectiveCounts[stance] > 0);

  return {
    recentNewsCount: recentNews.length,
    latestNewsAt: latest(news.map((row) => row.published_at)),
    latestReportAt: latest(input.reports.filter((row) => row.ticker === input.ticker).map((row) => row.published_at)),
    averageSentiment: sentiments.length
      ? sentiments.reduce((sum, value) => sum + value, 0) / sentiments.length
      : null,
    perspectiveCounts,
    perspectiveDivergence: expressed.length > 1,
    latestPerspectiveAt: latest(perspectives.map((row) => row.created_at)),
  };
}
