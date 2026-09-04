import type { StockUniverse, WatchlistItem } from '@/lib/supabase/database.types';
import type { MarketPhaseKey } from '@/lib/today/clock';
import type { HistoricalWatchlistMetrics } from './analytics';
import type { WatchlistResearchSummary } from './research-summary';

export type DataStatus = 'fresh' | 'delayed' | 'stale' | 'unavailable';

export interface DataEnvelope<T> {
  value: T | null;
  asOf: string | null;
  source: string | null;
  status: DataStatus;
  warnings: string[];
}

export interface WatchlistMarketSnapshot {
  quote: {
    price: number | null;
    changePct: number | null;
    peTtm: number | null;
    pb: number | null;
    marketCapLabel: string;
  };
  fundamentals: {
    roe: number | null;
    grossMargin: number | null;
    netMargin: number | null;
    dividendYield: number | null;
  };
  marketState: { phase: string; phaseKey: MarketPhaseKey; minutes?: number };
  radar: { level: string; score: number; headline: string };
  events: Array<{ kind: string; date: string; daysUntil: number; title: string }>;
}

export interface WatchlistOverviewItemRow {
  id: string;
  ticker: string;
  conviction: number;
  notes: string | null;
  sort_order: number;
  added_at: string;
  thesis: string | null;
  target_price: number | null;
  invalidation_conditions: string | null;
  confidence: number | null;
  review_at: string | null;
  tags: string[];
  status: WatchlistItem['status'];
  decision_version: number;
  updated_at: string;
}

export interface WatchlistOverviewGroupRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  watchlist_items: WatchlistOverviewItemRow[];
}

export interface WatchlistOverviewPageRow {
  group: Omit<WatchlistOverviewGroupRow, 'watchlist_items'>;
  item: WatchlistOverviewItemRow;
}

export interface WatchlistOverviewDatabasePage {
  total: number;
  rows: WatchlistOverviewPageRow[];
}

export interface WatchlistOverviewRow {
  group: { id: string; name: string; sortOrder: number };
  item: WatchlistOverviewItemRow;
  identity: StockUniverse | null;
  market: DataEnvelope<WatchlistMarketSnapshot> | null;
  history: DataEnvelope<HistoricalWatchlistMetrics> | null;
  research: DataEnvelope<WatchlistResearchSummary>;
}

export interface WatchlistOverviewResponse {
  generatedAt: string;
  ownerId: string;
  version: number;
  partial: boolean;
  total: number;
  page: { offset: number; limit: number; hasMore: boolean };
  rows: WatchlistOverviewRow[];
}
