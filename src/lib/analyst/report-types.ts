import type { DecisionAction, Market, TradeDirection } from '@/lib/supabase/database.types';

export interface ReportAnalyst {
  id: string;
  name: string;
}

export interface ReportRecommendation {
  id: string;
  analystId: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  recommendedAt: string;
  withdrawnAt: string | null;
  referencePrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  score: number | null;
  hit: boolean | null;
  scoredAt: string | null;
  forward5dPct: number | null;
  forward20dPct: number | null;
  forward60dPct: number | null;
}

export interface ReportTrade {
  id: string;
  decisionId: string;
  recommendationId: string;
  analystId: string;
  ticker: string;
  direction: TradeDirection;
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  executedAt: string;
}

export interface AnalystReport {
  generatedAt: string;
  analysts: ReportAnalyst[];
  recommendations: ReportRecommendation[];
  trades: ReportTrade[];
}
