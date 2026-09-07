import type { StockUniverse, WatchlistItem } from '@/lib/supabase/database.types';
import type { MarketPhaseKey } from '@/lib/today/clock';
import type { HistoricalWatchlistMetrics } from './analytics';
import type { WatchlistOverviewCursor } from './overview-pagination';
import type { WatchlistOverviewQueryCursor } from './overview-query';
import type { WatchlistResearchSummary } from './research-summary';
import type { WatchlistPeerMetrics } from './peer-metrics';
import type { WatchlistComposition } from './composition';
import type { WatchlistAlertSummary } from './alert-summary';
import type { WatchlistDataCapability } from './data-capability';
import type { WatchlistMetricKey } from './metric-registry';
import type { WatchlistOverviewQuerySort } from './overview-query';

export type DataStatus = 'fresh' | 'delayed' | 'stale' | 'unavailable';

export interface DataEnvelope<T> {
  value: T | null;
  asOf: string | null;
  source: string | null;
  status: DataStatus;
  warnings: string[];
  reasonCode?: string | null;
  retryable?: boolean;
  coverage?: { available: number; total: number } | null;
  observations?: number | null;
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
  querySnapshot?: WatchlistOverviewQuerySnapshot | null;
}

export interface WatchlistOverviewQuerySnapshot {
  sortKey: WatchlistOverviewQuerySort;
  sortNumber: number | null;
  sortText: string | null;
  sortAsOf: string | null;
  metricKey: WatchlistMetricKey | null;
  metricNumber: number | null;
  metricAsOf: string | null;
  currency: string | null;
}

export interface WatchlistOverviewDatabasePage {
  total: number;
  rows: WatchlistOverviewPageRow[];
  hasMore?: boolean;
  nextCursor?: WatchlistOverviewCursor | WatchlistOverviewQueryCursor | null;
}

export interface WatchlistOverviewRow {
  group: { id: string; name: string; sortOrder: number };
  item: WatchlistOverviewItemRow;
  identity: StockUniverse | null;
  market: DataEnvelope<WatchlistMarketSnapshot> | null;
  history: DataEnvelope<HistoricalWatchlistMetrics> | null;
  peer: DataEnvelope<WatchlistPeerMetrics> | null;
  research: DataEnvelope<WatchlistResearchSummary>;
  alerts: DataEnvelope<WatchlistAlertSummary>;
  querySnapshot: WatchlistOverviewQuerySnapshot | null;
}

export interface WatchlistOverviewResponse {
  generatedAt: string;
  ownerId: string;
  version: number;
  dataStatus: 'complete' | 'partial';
  warnings: string[];
  capabilities: WatchlistDataCapability[];
  /** Legacy pagination alias. Prefer page.hasMore. */
  partial: boolean;
  total: number;
  composition: DataEnvelope<WatchlistComposition> | null;
  page: {
    /** Legacy offset is null for keyset-paginated responses. */
    offset: number | null;
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  };
  rows: WatchlistOverviewRow[];
}
