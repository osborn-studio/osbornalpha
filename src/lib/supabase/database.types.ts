// Auto-generated style types matching supabase/migrations/20260515000000_initial_schema.sql
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
  created_at: string;
  updated_at: string;
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
    };
  };
};
