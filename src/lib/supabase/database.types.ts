// Auto-generated style types matching supabase/migrations/20260515000000_initial_schema.sql
// + 20260702090000_decision_layer.sql (decisions/trades/positions/decision_reviews/artifacts)
// + 20260703090000_usage_events.sql (usage_events)
// + 20260703120000_stripe_billing.sql (profiles.plan_expires_at, stripe_events)
// + 20260728090000_llm_daily_cost_budget.sql (LLM cost accounting and reservations)
// + 20260728100000_usage_event_status.sql (successful-run quota semantics)
// + 20260728110000_llm_incurred_budget.sql (durable pre-network spend state)
// + 20260728140000_cap_exempt_platform_audit.sql (cap-exempt durable accounting)
// + 20260728150000_profile_entitlement_security.sql (backend-managed entitlements)
// + 20260904170000_watchlist_overview_cursor.sql (keyset overview pagination)
// + 20260904180000_watchlist_research_quality.sql (research provenance flags)
// + 20260904190000_watchlist_research_refresh_cleanup.sql (ticker queue migration)
// Regenerate with: npm run supabase:types (after supabase link)

export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';
export type AssetType = 'stock' | 'etf' | 'convertible_bond' | 'fund' | 'index' | 'unknown';
export type Stance = 'bullish' | 'neutral' | 'bearish';
export type Persona =
  | 'buffett' | 'munger' | 'druckenmiller' | 'marks' | 'lynch'
  | 'burry' | 'zhang_kun' | 'li_lu' | 'duan_yongping';

export interface StockUniverse {
  ticker: string;
  symbol: string;
  name: string;
  name_en: string | null;
  full_name: string | null;
  pinyin: string | null;
  market: Market;
  exchange: string | null;
  asset_type: AssetType;
  fund_subtype: string | null;
  instrument_form: string | null;
  currency: string | null;
  country_code: string | null;
  industry: string | null;
  list_status: string;
  list_date: string | null;
  delist_date: string | null;
  is_active: boolean;
  source: string | null;
  source_updated_at: string | null;
  metadata: Record<string, unknown>;
  last_price: number | null;
  updated_at: string;
}

export interface SecurityAlias {
  alias: string;
  ticker: string;
  alias_type: string;
  source: string;
  created_at: string;
}

export interface SecurityUniverseMembership {
  ticker: string;
  universe: string;
  rank: number | null;
  market_cap_usd: number | null;
  as_of_date: string;
  is_active: boolean;
  source: string;
  updated_at: string;
}

export interface SecuritySyncRun {
  id: string;
  source: string;
  scope: string;
  status: 'running' | 'staged' | 'success' | 'rejected' | 'failed';
  started_at: string;
  completed_at: string | null;
  source_as_of: string | null;
  fetched_count: number;
  accepted_count: number;
  inserted_count: number;
  updated_count: number;
  deactivated_count: number;
  error_code: string | null;
  error_message: string | null;
  checksum: string | null;
  snapshot_path: string | null;
}

export interface SecurityDiscoveryCandidate {
  id: string;
  normalized_query: string;
  proposed_ticker: string;
  source: string;
  normalized_payload: Record<string, unknown>;
  status: 'pending' | 'verified' | 'promoted' | 'rejected';
  seen_count: number;
  first_seen_at: string;
  last_seen_at: string;
  review_reason: string | null;
}

export interface SecuritySyncStaging {
  run_id: string;
  record_kind: 'security' | 'alias' | 'membership';
  natural_key: string;
  normalized_payload: Record<string, unknown>;
  created_at: string;
}

export interface SecurityResolveRateLimit {
  subject_hash: string;
  window_started_at: string;
  attempts: number;
}

export interface SecuritySearchRow {
  t: string;
  n: string;
  py: string;
  m: Market;
  asset_type: AssetType;
  exchange: string | null;
  list_status: string;
  match_kind: string;
  verification_status: string;
  selectable: boolean;
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
  thesis: string | null;
  target_price: number | null;
  invalidation_conditions: string | null;
  confidence: number | null;
  review_at: string | null;
  tags: string[];
  status: 'inbox' | 'researching' | 'watching' | 'ready' | 'paused' | 'invalidated';
  decision_version: number;
  updated_at: string;
}

export interface WatchlistItemDecisionHistory {
  id: string;
  user_id: string;
  watchlist_item_id: string;
  version: number;
  before_value: Record<string, unknown>;
  after_value: Record<string, unknown>;
  changed_at: string;
}

export interface WatchlistSyncState {
  user_id: string;
  version: number;
  last_mutation_id: string | null;
  updated_at: string;
}

export interface WatchlistAlert {
  id: string;
  user_id: string;
  watchlist_item_id: string;
  alert_type: 'price' | 'change_pct' | 'volume_ratio' | 'valuation' | 'event' | 'rating' | 'perspective';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'crosses_above' | 'crosses_below' | null;
  threshold_numeric: number | null;
  config: Record<string, unknown>;
  enabled: boolean;
  cooldown_minutes: number;
  last_observed_value: number | null;
  last_observed_key: string | null;
  last_evaluated_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistAlertEvent {
  id: string;
  user_id: string;
  alert_id: string;
  watchlist_item_id: string;
  ticker: string;
  alert_type: WatchlistAlert['alert_type'];
  event_key: string;
  observed_value: number | null;
  threshold_numeric: number | null;
  payload: Record<string, unknown>;
  delivery_channels?: Record<string, unknown>;
  delivery_status: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter' | 'skipped';
  delivery_attempts: number;
  last_delivery_error: string | null;
  claimed_at: string | null;
  next_delivery_at: string;
  dead_lettered_at: string | null;
  provider_message_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  triggered_at: string;
  created_at: string;
}

export interface WatchlistAlertRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  evaluated: number;
  triggered: number;
  unavailable: number;
  delivery_claimed: number;
  delivery_delivered: number;
  delivery_failed: number;
  delivery_dead_letter: number;
  delivery_skipped: number;
  delivery_deferred: number;
  saturated: boolean;
  error: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface WatchlistResearchRefreshState {
  user_id: string;
  ticker: string;
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
  failure_count: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_refresh_at: string;
  lease_expires_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface WatchlistResearchTickerRefreshState {
  ticker: string;
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
  failure_count: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_refresh_at: string;
  lease_expires_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface WatchlistOperationAction {
  id: string;
  actor_id: string | null;
  action: 'retry_failed_delivery' | 'retry_dead_letter' | 'release_stale_processing' | 'retry_failed_research';
  arguments: Record<string, unknown>;
  affected_count: number;
  created_at: string;
}

export interface WatchlistTrash {
  id: string;
  user_id: string;
  entity_type: 'group' | 'item';
  source_id: string;
  label: string;
  payload: Record<string, unknown>;
  deleted_at: string;
  expires_at: string;
  restored_at: string | null;
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
  brief_id: string | null;
  generation_id: string | null;
  user_id: string;
  ticker: string;
  persona: Persona;
  stance: Stance;
  confidence: number;
  summary: string | null;
  cites: string[];
  citations: Array<{
    id: string;
    title: string;
    url: string;
    domain: string;
    publishedAt: string | null;
    trustScore: number;
    qualityScore?: number;
    qualityFlags?: string[];
  }>;
  source: string | null;
  model_version: string | null;
  prompt_version: string | null;
  evidence_request_id: string | null;
  evidence_fetched_at: string | null;
  evidence_result_count: number;
  evidence_coverage_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface NewsItem {
  id: string;
  user_id: string;
  ticker: string;
  title: string;
  source: string | null;
  source_key: string;
  url: string | null;
  snippet: string | null;
  sentiment: number | null;
  published_at: string | null;
  fetched_at: string;
  trust_score: number | null;
  relevance_score: number | null;
  quality_score: number | null;
  quality_flags: string[];
  source_type: string | null;
}

export interface BrokerReport {
  id: string;
  user_id: string;
  ticker: string;
  source_key: string;
  title: string | null;
  broker: string | null;
  rating: string | null;
  target_price: string | null;
  target_change_pct: number | null;
  pdf_url: string | null;
  ai_summary: string | null;
  published_at: string | null;
  fetched_at: string;
  source: string | null;
  trust_score: number | null;
  relevance_score: number | null;
  quality_score: number | null;
  quality_flags: string[];
}

export interface ExternalEvidenceRecord {
  citation_id: string;
  canonical_url: string;
  title: string;
  domain: string;
  snippet: string;
  source_type: string;
  published_at: string | null;
  fetched_at: string;
  provider: string | null;
  trust_score: number;
  relevance_score: number;
  quality_score: number;
  quality_flags: string[];
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalEvidenceRun {
  request_id: string;
  request_hash: string;
  ticker: string | null;
  scopes: string[];
  provider: string | null;
  status: string;
  query_count: number;
  result_count: number;
  duration_ms: number;
  estimated_cost_microusd: number | null;
  warnings: string[];
  created_at: string;
}

export interface ExternalEvidenceTicker {
  ticker: string;
  citation_id: string;
  request_id: string;
  expires_at: string;
}

export interface UserPreferences {
  user_id: string;
  language: string;
  color_scheme: 'cn' | 'us';
  telegram_chat_id: string | null;
  email_notifications: boolean;
  daily_brief_time: string;
  timezone: string;
  watchlist_alert_channels: Array<'email' | 'telegram'>;
  watchlist_alert_delivery_mode: 'instant' | 'digest';
  watchlist_alert_quiet_start: string | null;
  watchlist_alert_quiet_end: string | null;
  watchlist_alert_digest_time: string;
  updated_at: string;
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
  idempotency_key: string | null;
  user_id: string;
  feature: UsageFeature;
  ticker: string | null;
  tokens_in: number;
  tokens_out: number;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  cache_hit_input_tokens: number;
  cache_miss_input_tokens: number;
  output_tokens: number;
  cost_micrormb: number;
  pricing_version: string | null;
  usd_cny_micros: number | null;
  usage_estimated: boolean;
  byo: boolean;
  status: 'pending' | 'completed' | 'failed';
  run_provider: string;
  run_model: string;
  run_pricing_version: string | null;
  run_usd_cny_micros: number | null;
  run_byo: boolean;
  finalized_at: string | null;
  created_at: string;
}

export type LlmCostReservationStatus = 'reserved' | 'incurred' | 'settled' | 'released';

export interface LlmCostReservation {
  id: string;
  user_id: string;
  feature: UsageFeature;
  provider: string;
  model: string;
  reserved_micrormb: number;
  settled_micrormb: number | null;
  input_tokens: number | null;
  cache_hit_input_tokens: number | null;
  cache_miss_input_tokens: number | null;
  output_tokens: number | null;
  pricing_version: string | null;
  usd_cny_micros: number | null;
  usage_estimated: boolean | null;
  cap_exempt: boolean;
  cap_exempt_idempotency_key: string | null;
  cap_exempt_snapshot: Record<string, unknown> | null;
  status: LlmCostReservationStatus;
  expires_at: string;
  created_at: string;
  settled_at: string | null;
}

export interface LlmBudgetReservationState {
  reservation_id: string;
  user_id: string;
  feature: UsageFeature;
  provider: string;
  model: string;
  reserved_micrormb: number;
  settled_micrormb: number | null;
  status: LlmCostReservationStatus;
  expires_at: string;
  created_at: string;
  settled_at: string | null;
}

export interface UserEvent {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  event_name: string;
  path: string | null;
  metadata: Record<string, unknown>;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
}

export interface AiRun {
  id: string;
  user_id: string;
  ticker: string | null;
  method_id: string;
  question: string | null;
  status: 'running' | 'completed' | 'failed';
  content_md: string | null;
  verdict: Record<string, unknown> | null;
  error_code: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface ServiceAlertRun {
  id: string;
  check_name: 'ai_daily' | 'quote_15m' | 'auth_email_daily';
  window_start: string;
  window_end: string;
  status: 'healthy' | 'alerting' | 'error';
  metrics: Record<string, unknown>;
  violations: Array<Record<string, unknown>>;
  delivery: Record<string, unknown>;
  created_at: string;
}

export interface AuthEmailProbeRun {
  id: string;
  recipient_hash: string;
  domain: string;
  probe_date: string;
  signup_requested_at: string | null;
  signup_delivery: 'pending' | 'delayed' | 'delivered' | 'failed';
  signup_delivery_at: string | null;
  recovery_requested_at: string | null;
  recovery_delivery: 'pending' | 'delayed' | 'delivered' | 'failed';
  recovery_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResendWebhookEvent {
  svix_id: string;
  recipient_hash: string;
  email_id: string | null;
  event_type: string;
  category: 'signup' | 'recovery';
  occurred_at: string;
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
      security_aliases: { Row: SecurityAlias; Insert: Partial<SecurityAlias>; Update: Partial<SecurityAlias> };
      security_universe_memberships: { Row: SecurityUniverseMembership; Insert: Partial<SecurityUniverseMembership>; Update: Partial<SecurityUniverseMembership> };
      security_sync_runs: { Row: SecuritySyncRun; Insert: Partial<SecuritySyncRun>; Update: Partial<SecuritySyncRun> };
      security_discovery_candidates: { Row: SecurityDiscoveryCandidate; Insert: Partial<SecurityDiscoveryCandidate>; Update: Partial<SecurityDiscoveryCandidate> };
      security_sync_staging: { Row: SecuritySyncStaging; Insert: Partial<SecuritySyncStaging>; Update: Partial<SecuritySyncStaging> };
      security_resolve_rate_limits: { Row: SecurityResolveRateLimit; Insert: Partial<SecurityResolveRateLimit>; Update: Partial<SecurityResolveRateLimit> };
      financial_history: { Row: FinancialHistory; Insert: Partial<FinancialHistory>; Update: Partial<FinancialHistory> };
      watchlists: { Row: Watchlist; Insert: Partial<Watchlist>; Update: Partial<Watchlist> };
      watchlist_items: { Row: WatchlistItem; Insert: Partial<WatchlistItem>; Update: Partial<WatchlistItem> };
      watchlist_sync_state: { Row: WatchlistSyncState; Insert: Partial<WatchlistSyncState>; Update: Partial<WatchlistSyncState> };
      watchlist_alerts: { Row: WatchlistAlert; Insert: Partial<WatchlistAlert>; Update: Partial<WatchlistAlert> };
      watchlist_alert_events: { Row: WatchlistAlertEvent; Insert: Partial<WatchlistAlertEvent>; Update: Partial<WatchlistAlertEvent> };
      watchlist_alert_runs: { Row: WatchlistAlertRun; Insert: Partial<WatchlistAlertRun>; Update: Partial<WatchlistAlertRun> };
      watchlist_research_refresh_state: { Row: WatchlistResearchRefreshState; Insert: Partial<WatchlistResearchRefreshState>; Update: Partial<WatchlistResearchRefreshState> };
      watchlist_research_ticker_refresh_state: { Row: WatchlistResearchTickerRefreshState; Insert: Partial<WatchlistResearchTickerRefreshState>; Update: Partial<WatchlistResearchTickerRefreshState> };
      watchlist_operation_actions: { Row: WatchlistOperationAction; Insert: Partial<WatchlistOperationAction>; Update: Partial<WatchlistOperationAction> };
      watchlist_trash: { Row: WatchlistTrash; Insert: Partial<WatchlistTrash>; Update: Partial<WatchlistTrash> };
      watchlist_item_decision_history: { Row: WatchlistItemDecisionHistory; Insert: Partial<WatchlistItemDecisionHistory>; Update: Partial<WatchlistItemDecisionHistory> };
      briefs: { Row: Brief; Insert: Partial<Brief>; Update: Partial<Brief> };
      stock_signals: { Row: StockSignal; Insert: Partial<StockSignal>; Update: Partial<StockSignal> };
      perspectives: { Row: Perspective; Insert: Partial<Perspective>; Update: Partial<Perspective> };
      news_items: { Row: NewsItem; Insert: Partial<NewsItem>; Update: Partial<NewsItem> };
      broker_reports: { Row: BrokerReport; Insert: Partial<BrokerReport>; Update: Partial<BrokerReport> };
      external_evidence: { Row: ExternalEvidenceRecord; Insert: Partial<ExternalEvidenceRecord>; Update: Partial<ExternalEvidenceRecord> };
      external_evidence_runs: { Row: ExternalEvidenceRun; Insert: Partial<ExternalEvidenceRun>; Update: Partial<ExternalEvidenceRun> };
      external_evidence_tickers: { Row: ExternalEvidenceTicker; Insert: Partial<ExternalEvidenceTicker>; Update: Partial<ExternalEvidenceTicker> };
      external_evidence_user_limits: { Row: { user_id: string; window_started_at: string; request_count: number; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      user_preferences: { Row: UserPreferences; Insert: Partial<UserPreferences>; Update: Partial<UserPreferences> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      decisions: { Row: Decision; Insert: Partial<Decision>; Update: Partial<Decision> };
      trades: { Row: Trade; Insert: Partial<Trade>; Update: Partial<Trade> };
      positions: { Row: Position; Insert: Partial<Position>; Update: Partial<Position> };
      decision_reviews: { Row: DecisionReview; Insert: Partial<DecisionReview>; Update: Partial<DecisionReview> };
      artifacts: { Row: Artifact; Insert: Partial<Artifact>; Update: Partial<Artifact> };
      usage_events: { Row: UsageEvent; Insert: Partial<UsageEvent>; Update: Partial<UsageEvent> };
      llm_cost_reservations: { Row: LlmCostReservation; Insert: Partial<LlmCostReservation>; Update: Partial<LlmCostReservation> };
      user_events: { Row: UserEvent; Insert: Partial<UserEvent>; Update: Partial<UserEvent> };
      ai_runs: { Row: AiRun; Insert: Partial<AiRun>; Update: Partial<AiRun> };
      service_alert_runs: { Row: ServiceAlertRun; Insert: Partial<ServiceAlertRun>; Update: Partial<ServiceAlertRun> };
      auth_email_probe_runs: { Row: AuthEmailProbeRun; Insert: Partial<AuthEmailProbeRun>; Update: Partial<AuthEmailProbeRun> };
      resend_webhook_events: { Row: ResendWebhookEvent; Insert: Partial<ResendWebhookEvent>; Update: Partial<ResendWebhookEvent> };
      stripe_events: { Row: StripeEvent; Insert: Partial<StripeEvent>; Update: Partial<StripeEvent> };
    };
    Functions: {
      search_securities: {
        Args: { p_query: string; p_limit?: number };
        Returns: SecuritySearchRow[];
      };
      consume_security_resolve_quota: {
        Args: { p_subject_hash: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      promote_verified_security: {
        Args: {
          p_security: Record<string, unknown>;
          p_aliases: Array<Record<string, unknown>>;
          p_memberships: Array<Record<string, unknown>>;
        };
        Returns: string;
      };
      claim_watchlist_alert_events: {
        Args: { p_limit?: number };
        Returns: WatchlistAlertEvent[];
      };
      set_watchlist_alert_event_read: {
        Args: { p_event_id: string; p_read: boolean };
        Returns: WatchlistAlertEvent[];
      };
      retry_watchlist_alert_event_delivery: {
        Args: { p_event_id: string };
        Returns: WatchlistAlertEvent[];
      };
      defer_watchlist_alert_events: {
        Args: { p_event_ids: string[]; p_next_delivery_at: string };
        Returns: number;
      };
      import_watchlist_bundle: {
        Args: {
          p_bundle: Record<string, unknown>;
          p_mode: 'merge' | 'replace';
          p_mutation_id: string;
        };
        Returns: Array<{
          version: number;
          groups_created: number;
          groups_updated: number;
          items_created: number;
          items_updated: number;
          alerts_created: number;
          alerts_updated: number;
        }>;
      };
      get_watchlist_overview_page: {
        Args: { p_offset?: number; p_limit?: number; p_ticker?: string | null };
        Returns: Record<string, unknown>;
      };
      get_watchlist_overview_cursor: {
        Args: {
          p_group_sort?: number | null;
          p_item_sort?: number | null;
          p_item_id?: string | null;
          p_limit?: number;
          p_ticker?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      start_watchlist_alert_run: {
        Args: { p_started_at?: string };
        Returns: string | null;
      };
      claim_watchlist_research_refresh: {
        Args: { p_limit?: number; p_lease_minutes?: number };
        Returns: WatchlistResearchRefreshState[];
      };
      claim_watchlist_research_ticker_refresh: {
        Args: { p_limit?: number; p_lease_minutes?: number };
        Returns: WatchlistResearchTickerRefreshState[];
      };
      run_watchlist_admin_operation: {
        Args: {
          p_actor_id: string;
          p_action: string;
          p_limit?: number;
          p_older_than_minutes?: number;
          p_tickers?: string[] | null;
        };
        Returns: { action: string; affected: number };
      };
      restore_watchlist_trash: {
        Args: { p_trash_id: string; p_expected_version: number; p_mutation_id: string };
        Returns: Array<{ version: number; applied: boolean; restored_items: number }>;
      };
      consume_external_evidence_user_quota: {
        Args: { p_limit?: number; p_window_seconds?: number };
        Returns: boolean;
      };
      watchlist_research_summaries: {
        Args: { p_tickers: string[] };
        Returns: Array<{
          ticker: string;
          recent_news_count: number;
          latest_news_at: string | null;
          average_sentiment: number | null;
          sentiment_sample_size: number;
          sentiment_coverage_ratio: number;
          latest_report_at: string | null;
          bullish_count: number;
          neutral_count: number;
          bearish_count: number;
          latest_perspective_at: string | null;
        }>;
      };
      watchlist_alert_research_candidates: {
        Args: { p_pairs: Array<{ user_id: string; ticker: string }>; p_limit_per_kind?: number };
        Returns: Array<{
          owner_id: string;
          ticker: string;
          reports: BrokerReport[];
          perspectives: Perspective[];
        }>;
      };
      commit_security_sync: {
        Args: { p_run_id: string };
        Returns: undefined;
      };
      replace_watchlist_snapshot: {
        Args: { p_expected_version: number; p_mutation_id: string; p_groups: Array<Record<string, unknown>> };
        Returns: Array<{ version: number; applied: boolean }>;
      };
      update_watchlist_item_decision: {
        Args: { p_item_id: string; p_expected_version: number; p_patch: Record<string, unknown> };
        Returns: WatchlistItem[];
      };
      bulk_update_watchlist_item_tags: {
        Args: {
          p_items: Array<{ id: string; expected_version: number }>;
          p_tag: string;
          p_mode?: 'add' | 'remove';
        };
        Returns: WatchlistItem[];
      };
      reserve_llm_daily_budget: {
        Args: {
          p_user_id: string;
          p_feature: UsageFeature;
          p_provider: string;
          p_model: string;
          p_requested_micrormb: number;
          p_daily_limit_micrormb: number;
          p_ttl_seconds: number;
        };
        Returns: Array<{
          allowed: boolean;
          reservation_id: string | null;
          used_micrormb: number;
          limit_micrormb: number;
        }>;
      };
      create_cap_exempt_llm_audit: {
        Args: {
          p_idempotency_key: string;
          p_user_id: string;
          p_feature: UsageFeature;
          p_provider: string;
          p_model: string;
          p_reserved_micrormb: number;
          p_input_tokens: number;
          p_cache_hit_input_tokens: number;
          p_cache_miss_input_tokens: number;
          p_output_tokens: number;
          p_pricing_version: string;
          p_usd_cny_micros: number;
          p_usage_estimated: boolean;
        };
        Returns: Array<LlmBudgetReservationState & { cap_exempt: boolean }>;
      };
      settle_llm_budget: {
        Args: {
          p_reservation_id: string;
          p_actual_micrormb: number;
          p_input_tokens: number;
          p_cache_hit_input_tokens: number;
          p_cache_miss_input_tokens: number;
          p_output_tokens: number;
          p_pricing_version: string;
          p_usd_cny_micros: number;
          p_usage_estimated: boolean;
        };
        Returns: LlmBudgetReservationState[];
      };
      finalize_llm_budget_incurred: {
        Args: {
          p_reservation_id: string;
          p_input_tokens: number;
          p_cache_hit_input_tokens: number;
          p_cache_miss_input_tokens: number;
          p_output_tokens: number;
          p_pricing_version: string;
          p_usd_cny_micros: number;
          p_usage_estimated: boolean;
        };
        Returns: LlmBudgetReservationState[];
      };
      mark_llm_budget_incurred: {
        Args: {
          p_reservation_id: string;
          p_input_tokens: number;
          p_cache_hit_input_tokens: number;
          p_cache_miss_input_tokens: number;
          p_output_tokens: number;
          p_pricing_version: string;
          p_usd_cny_micros: number;
          p_usage_estimated: boolean;
        };
        Returns: LlmBudgetReservationState[];
      };
      release_llm_budget: {
        Args: { p_reservation_id: string };
        Returns: LlmBudgetReservationState[];
      };
      begin_usage_run: {
        Args: {
          p_idempotency_key: string;
          p_user_id: string;
          p_feature: UsageFeature;
          p_ticker: string | null;
          p_provider: string;
          p_model: string;
          p_pricing_version: string | null;
          p_usd_cny_micros: number | null;
          p_byo: boolean;
        };
        Returns: Array<{ id: string; status: 'pending' | 'completed' | 'failed' }>;
      };
      finalize_usage_run: {
        Args: {
          p_idempotency_key: string;
          p_user_id: string;
          p_feature: UsageFeature;
          p_ticker: string | null;
          p_provider: string;
          p_model: string;
          p_input_tokens: number;
          p_cache_hit_input_tokens: number;
          p_cache_miss_input_tokens: number;
          p_output_tokens: number;
          p_cost_micrormb: number;
          p_pricing_version: string | null;
          p_usd_cny_micros: number | null;
          p_usage_estimated: boolean;
          p_byo: boolean;
          p_status: 'completed' | 'failed';
        };
        Returns: Array<{ id: string; status: 'completed' | 'failed' }>;
      };
      fail_stale_usage_runs: {
        Args: { p_stale_after_seconds: number; p_limit: number };
        Returns: number;
      };
    };
  };
};
