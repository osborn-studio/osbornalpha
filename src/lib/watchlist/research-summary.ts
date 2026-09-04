import type { Stance } from '@/lib/supabase/database.types';
import { researchWindowCutoff, WATCHLIST_RESEARCH_WINDOW_DAYS } from './research-window';

export interface ResearchSummaryInput {
  ticker: string;
  news: Array<{ ticker: string; published_at: string; sentiment: number | null; quality_score?: number | null }>;
  reports: Array<{ ticker: string; published_at: string | null }>;
  perspectives: Array<{ ticker: string; stance: Stance; created_at: string }>;
  now?: Date;
}

export interface WatchlistResearchSummary {
  recentNewsCount: number;
  latestNewsAt: string | null;
  latestReportAt: string | null;
  averageSentiment: number | null;
  sentimentSampleSize: number;
  sentimentCoverageRatio: number;
  perspectiveCounts: Record<Stance, number>;
  perspectiveDivergence: boolean;
  latestPerspectiveAt: string | null;
  researchWindowDays: number;
}

export function weightedSentiment(
  rows: Array<{ sentiment: number | null; quality_score?: number | null; qualityScore?: number | null }>,
): { value: number | null; sampleSize: number; coverageRatio: number } {
  const scored = rows
    .filter((row) => row.sentiment != null && Number.isFinite(row.sentiment))
    .map((row) => {
      const quality = row.quality_score ?? row.qualityScore;
      return {
        value: row.sentiment as number,
        weight: quality != null && Number.isFinite(quality) && quality > 0
          ? Math.min(1, Math.max(0.1, quality))
          : 0.25,
      };
    });
  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  return {
    value: scored.length > 0 ? scored.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight : null,
    sampleSize: scored.length,
    coverageRatio: rows.length > 0 ? scored.length / rows.length : 0,
  };
}

function latest(values: Array<string | null>): string | null {
  return values.filter((value): value is string => !!value).sort().at(-1) ?? null;
}

export function summarizeWatchlistResearch(input: ResearchSummaryInput): WatchlistResearchSummary {
  const cutoff = researchWindowCutoff(input.now ?? new Date());
  const news = input.news.filter((row) => row.ticker === input.ticker);
  const recentNews = news.filter((row) => {
    const publishedAt = new Date(row.published_at).getTime();
    return Number.isFinite(publishedAt) && publishedAt >= cutoff.getTime();
  });
  const sentiments = weightedSentiment(recentNews);
  const perspectives = input.perspectives.filter((row) => row.ticker === input.ticker);
  const perspectiveCounts: Record<Stance, number> = { bullish: 0, neutral: 0, bearish: 0 };
  perspectives.forEach((row) => { perspectiveCounts[row.stance] += 1; });
  const expressed = (['bullish', 'bearish'] as Stance[]).filter((stance) => perspectiveCounts[stance] > 0);

  return {
    recentNewsCount: recentNews.length,
    latestNewsAt: latest(news.map((row) => row.published_at)),
    latestReportAt: latest(input.reports.filter((row) => row.ticker === input.ticker).map((row) => row.published_at)),
    averageSentiment: sentiments.value,
    sentimentSampleSize: sentiments.sampleSize,
    sentimentCoverageRatio: sentiments.coverageRatio,
    perspectiveCounts,
    perspectiveDivergence: expressed.length > 1,
    latestPerspectiveAt: latest(perspectives.map((row) => row.created_at)),
    researchWindowDays: WATCHLIST_RESEARCH_WINDOW_DAYS,
  };
}
