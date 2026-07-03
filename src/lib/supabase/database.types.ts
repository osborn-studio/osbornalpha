// Auto-generated style types matching supabase/migrations/20260515000000_initial_schema.sql
// + 20260702090000_decision_layer.sql (decisions/trades/positions/decision_reviews/artifacts)
// + 20260703090000_usage_events.sql (usage_events)
// + 20260703120000_stripe_billing.sql (profiles.plan_expires_at, stripe_events)
// Regenerate with: npm run supabase:types (after supabase link)

export type Market = 'A' | 'HK' | 'US';
export type Stance = 'bullish' | 'neutral' | 'bearish';
export type Persona =
  | 'buffett' | 'munger' | 'druckenmiller' | 'marks' | 'lynch'
  | 'burry' | 'zhang_kun' | 'li_lu' | 'duan_yongping';

export interface StockUniverse {
  ticker: string;
  name: string;
  pinyin: string | null;
  market: Market;
  industry: string | null;
  is_active: boolean;
  last_price: number | null;
  updated_at: string;
}

export interface FinancialHistory {
  ticker: string;
  fiscal_year: number;
  period: string;
  revenue: number | null;
  net_income: number | null;
  roe: number | null;
  gross_margin: number | null;
  free_cash_flow: number | null;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  weight: number;
  sort_order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  user_id: string;
  ticker: string;
  conviction: number;
  notes: string | null;
  sort_order: number;
  added_at: string;
}

export interface Brief {
  id: string;
  user_id: string;
  brief_date: string;
  language: string;
  ai_confidence: number | null;
  confidence_label: string | null;
  content_md: string | null;
  content_json: Record<string, unknown> | null;
  total_cost_usd: number | null;
  duration_s: number | null;
  status: string;
  generated_at: string;
}

export interface StockSignal {
  id: string;
  brief_id: string;
  user_id: string;
  ticker: string;
  score: number;
  triggers: Array<{ rule: string; desc: string; weight: number }>;
  rank: number | null;
  created_at: string;
}

export interface Perspective {
  id: string;
  brief_id: string;
  user_id: string;
  ticker: string;
  persona: Persona;
  stance: Stance;
  confidence: number;
  summary: string | null;
  cites: string[];
  created_at: string;
}

export interface NewsItem {
  id: string;
  user_id: string;
  ticker: string;
  title: string;
  source: string | null;
  url: string | null;
  sentiment: number | null;
  published_at: string;
  fetched_at: string;
}

export interface BrokerReport {
  id: string;
  user_id: string;
  ticker: string;
  broker: string | null;
  rating: string | null;
  target_price: string | null;
  target_change_pct: number | null;
  pdf_url: string | null;
  ai_summary: string | null;
  published_at: string | null;
  fetched_at: string;
}

export interface UserPreferences {
  user_id: string;
  language: string;
  color_scheme: 'cn' | 'us';
  telegram_chat_id: string | null;
  email_notifications: boolean;
  daily_brief_time: string;
  timezone: string;
}

// Convenient row aliases
export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: string;
  role: string;
  usage: Record<string, unknown>;
  stripe_customer_id: string | null;
  plan_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DecisionAction = 'buy' | 'sell' | 'trim' | 'add' | 'hold' | 'pass';
export type DecisionSource = 'manual' | 'copilot' | 'signal' | 'radar' | 'skill';
export type DecisionStatus = 'open' | 'executed' | 'expired' | 'cancelled';
export type DecisionHorizon = 'short' | 'mid' | 'long';
// The executable subset of DecisionAction — derived so the two can't drift.
export type TradeDirection = Extract<DecisionAction, 'buy' | 'sell'>;

export interface Decision {
  id: string;
  user_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  thesis: string | null;
  confidence: number | null;
  entry_low: number | null;
  entry_high: number | null;
  target_price: number | null;
  stop_loss: number | null;
  horizon: DecisionHorizon | null;
  source_type: DecisionSource;
  source_ref: Record<string, unknown> | null;
  status: DecisionStatus;
  decided_at: string;
  expires_at: string | null;
}

export interface Trade {
  id: string;
  user_id: string;
  decision_id: string | null;
  ticker: string;
  direction: TradeDirection;
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  executed_at: string;
  note: string | null;
}

export interface Position {
  user_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  realized_pnl: number;
  currency: string;
  opened_at: string;
  closed_at: string | null;
}

export interface DecisionReview {
  id: string;
  decision_id: string;
  user_id: string;
  scored_at: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
}

export interface Artifact {
  id: string;
  user_id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  content_md: string;
  params: Record<string, unknown> | null;
  created_at: string;
}

export type UsageFeature = 'copilot' | 'perspectives' | 'brief_preview';

export interface UsageEvent {
  id: string;
  user_id: string;
  feature: UsageFeature;
  ticker: string | null;
  tokens_in: number;
  tokens_out: number;
  byo: boolean;
  created_at: string;
}

// Webhook idempotency ledger — service-role only (no RLS), see
// supabase/migrations/20260703120000_stripe_billing.sql.
export interface StripeEvent {
  id: string;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      stocks_universe: { Row: StockUniverse; Insert: Partial<StockUniverse>; Update: Partial<StockUniverse> };
      financial_history: { Row: FinancialHistory; Insert: Partial<FinancialHistory>; Update: Partial<FinancialHistory> };
      watchlists: { Row: Watchlist; Insert: Partial<Watchlist>; Update: Partial<Watchlist> };
      watchlist_items: { Row: WatchlistItem; Insert: Partial<WatchlistItem>; Update: Partial<WatchlistItem> };
      briefs: { Row: Brief; Insert: Partial<Brief>; Update: Partial<Brief> };
      stock_signals: { Row: StockSignal; Insert: Partial<StockSignal>; Update: Partial<StockSignal> };
      perspectives: { Row: Perspective; Insert: Partial<Perspective>; Update: Partial<Perspective> };
      news_items: { Row: NewsItem; Insert: Partial<NewsItem>; Update: Partial<NewsItem> };
      broker_reports: { Row: BrokerReport; Insert: Partial<BrokerReport>; Update: Partial<BrokerReport> };
      user_preferences: { Row: UserPreferences; Insert: Partial<UserPreferences>; Update: Partial<UserPreferences> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      decisions: { Row: Decision; Insert: Partial<Decision>; Update: Partial<Decision> };
      trades: { Row: Trade; Insert: Partial<Trade>; Update: Partial<Trade> };
      positions: { Row: Position; Insert: Partial<Position>; Update: Partial<Position> };
      decision_reviews: { Row: DecisionReview; Insert: Partial<DecisionReview>; Update: Partial<DecisionReview> };
      artifacts: { Row: Artifact; Insert: Partial<Artifact>; Update: Partial<Artifact> };
      usage_events: { Row: UsageEvent; Insert: Partial<UsageEvent>; Update: Partial<UsageEvent> };
      stripe_events: { Row: StripeEvent; Insert: Partial<StripeEvent>; Update: Partial<StripeEvent> };
    };
  };
};
