// Auto-generated style types matching supabase/migrations/20260515000000_initial_schema.sql
// + 20260702090000_decision_layer.sql (decisions/trades/positions/decision_reviews/artifacts)
// + 20260703090000_usage_events.sql (usage_events)
// + 20260703120000_stripe_billing.sql (profiles.plan_expires_at, stripe_events)
// + 20260728090000_llm_daily_cost_budget.sql (LLM cost accounting and reservations)
// + 20260728100000_usage_event_status.sql (successful-run quota semantics)
// + 20260728110000_llm_incurred_budget.sql (durable pre-network spend state)
// + 20260728140000_cap_exempt_platform_audit.sql (cap-exempt durable accounting)
// + 20260728150000_profile_entitlement_security.sql (backend-managed entitlements)
// + 20261105090000_dq_foundation.sql (ingest_batches, dq_quarantine, dq_reconciliations, dq_freshness)
// + migrations up to 20261105091000_issuers.sql (issuers, issuer_securities, issuer_identifier_claims,
//   industry_classifications, issuer_industry_memberships; research_entity_* link columns are not typed here)
// + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)
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

// ─── Analyst scoring layer (spec 2026-10-17) ───
export type AnalystKind = 'human' | 'agent';
export type RecommendationSource = 'manual' | 'copilot' | 'playbook' | 'signal' | 'import';

export interface AnalystProfile {
  id: string;
  user_id: string;
  display_name: string;
  kind: AnalystKind;
  is_self: boolean;
  note: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface Recommendation {
  id: string;
  user_id: string;
  analyst_id: string;
  ticker: string;
  market: Market;
  action: DecisionAction;
  /** What the analyst said; never used as the fill price. */
  reference_price: number | null;
  rationale: string | null;
  confidence: number | null;
  target_price: number | null;
  stop_loss: number | null;
  horizon: DecisionHorizon | null;
  thesis_ref: string | null;
  source_type: RecommendationSource;
  source_ref: Record<string, unknown> | null;
  recommended_at: string;
  created_at: string;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
  /** Close of the first bar on/after recommended_at; set once by the scorer. */
  fill_price: number | null;
  fill_date: string | null;
}

export interface RecommendationScore {
  recommendation_id: string;
  user_id: string;
  scored_at: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
  last_close: number | null;
  last_close_date: string | null;
  /** Fill on the current price basis (base bar of the latest refresh); null for rows scored before 20261018090000. */
  base_close: number | null;
  base_date: string | null;
}

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
  /** Adoption link to an analyst recommendation (nullable). */
  recommendation_id: string | null;
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

// Data foundation (supabase/migrations/20261105090000_dq_foundation.sql) — service-role only.
export type IngestBatchStatus = 'running' | 'success' | 'partial' | 'failed' | 'rejected';
export interface IngestBatch {
  batch_id: string;
  producer: string;
  dataset: string;
  status: IngestBatchStatus;
  started_at: string;
  finished_at: string | null;
  counts: Record<string, unknown>;
  errors: unknown[];
  tool_versions: Record<string, unknown>;
  code_version: string | null;
  triggered_by: 'cron' | 'manual' | 'script';
}

export type DqQuarantineStatus = 'open' | 'resolved_accept' | 'resolved_reject';
export interface DqQuarantine {
  id: string;
  dataset: string;
  table_name: string;
  natural_key: string;
  reason_code: string;
  detail: Record<string, unknown>;
  payload: Record<string, unknown>;
  batch_id: string;
  status: DqQuarantineStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// numeric columns are returned by PostgREST as JSON numbers.
export interface DqReconciliation {
  id: string;
  dataset: string;
  left_source: string;
  right_source: string;
  natural_key: string;
  left_value: number | null;
  right_value: number | null;
  abs_diff: number | null;
  rel_diff: number | null;
  tolerance: number;
  passed: boolean;
  batch_id: string | null;
  created_at: string;
}

export type DqFreshnessStatus = 'fresh' | 'stale' | 'error' | 'missing';
export interface DqFreshness {
  dataset: string;
  expected_cadence: 'daily' | 'monthly' | 'quarterly' | 'event';
  last_ok_at: string | null;
  last_attempt_at: string | null;
  consecutive_errors: number;
  status: DqFreshnessStatus;
  detail: Record<string, unknown>;
  updated_at: string;
}

// 20261106090000_financial_facts.sql. numeric columns (value) arrive as JSON numbers and round in
// JavaScript — readers use value_text. bigint (state_rev, based_on_rev) arrives as a JSON number.
export type FactMarket = 'US' | 'CN';
export interface FactSyncRun {
  run_id: string;
  issuer_id: string;
  market: FactMarket;
  batch_id: string;
  mapping_gen: number;
  status: 'staged' | 'published' | 'abandoned';
  manifest: string[];
  started_at: string;
  published_at: string | null;
}
export interface Filing {
  filing_id: string;
  issuer_id: string;
  market: FactMarket;
  source: 'edgar' | 'tushare';
  origin: 'sec' | 'sse' | 'szse' | 'bse';
  form_type: string;
  fiscal_year: number | null;
  fiscal_period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'H1' | '9M' | null;
  period_end: string | null;
  available_date: string;
  source_ref: string;
  url: string | null;
  document_ref: string | null;
  document_url: string | null;
  link_attempts: number;
  mapping_gen: number;
  run_id: string;
  created_at: string;
}
export interface FinancialFact {
  fact_id: string;
  issuer_id: string;
  market: FactMarket;
  filing_id: string;
  run_id: string;
  concept: string;
  source_concept: string;
  statement: 'IS' | 'BS' | 'CF' | 'DEI';
  period_start: string | null;
  period_end: string;
  duration: '3M' | '6M' | '9M' | '12M' | 'INSTANT';
  value: number;
  value_text: string;
  unit: string;
  consolidation: 'consolidated' | 'parent';
  available_date: string;
  mapping_gen: number;
  mapping_version: string;
  status: 'staged' | 'ok' | 'quarantined';
  raw_hash: string;
  created_at: string;
}
export interface FinancialMetric {
  issuer_id: string;
  market: FactMarket;
  metric: string;
  period_start: string;
  period_end: string;
  duration: '3M' | '6M' | '9M' | '12M' | 'TTM' | 'INSTANT';
  value: number;
  value_text: string;
  unit: string;
  input_unit: string;
  basis: 'us_standard' | 'cn_standard' | 'cn_incl_intangibles' | 'cn_incl_bonds';
  formula_version: string;
  inputs: Array<{ fact_id: string; concept: string; filing_id: string; available_date: string }>;
  based_on_rev: number;
  as_of: string;
  computed_at: string;
}
export interface FactSyncScope {
  issuer_id: string;
  market: FactMarket;
  reasons: string[];
  priority: number;
  fetch_key: string;
  next_due_at: string;
  lease_until: string | null;
  lease_batch_id: string | null;
  state_rev: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_batch_id: string | null;
  last_status: 'success' | 'failed' | null;
  updated_at: string;
}

// Issuers (supabase/migrations/20261105091000_issuers.sql). issuers, issuer_securities,
// industry_classifications and issuer_industry_memberships are public read; claims are service-role only.
export type IssuerStatus = 'active' | 'merged' | 'dissolved';
export interface Issuer {
  issuer_id: string;
  canonical_name_zh: string | null;
  canonical_name_en: string | null;
  country_code: string | null;
  lei: string | null;
  cik: string | null;
  usci: string | null;
  cninfo_org_id: string | null;
  hkex_stock_code_primary: string | null;
  status: IssuerStatus;
  merged_into: string | null;
  provenance: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ShareClass = 'A' | 'H' | 'ADR' | 'common' | 'preferred' | 'other' | 'unknown';
export interface IssuerSecurity {
  issuer_id: string;
  ticker: string;
  isin: string | null;
  figi: string | null;
  share_class: ShareClass;
  is_primary: boolean;
  valid_from: string;
  valid_to: string | null;
  source: string;
  provenance: Record<string, unknown>;
}

export type IssuerIdentifierType = 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id';
export interface IssuerIdentifierClaim {
  id: string;
  issuer_id: string;
  id_type: IssuerIdentifierType;
  value: string;
  source: string;
  confidence: number;
  status: 'accepted' | 'pending' | 'rejected';
  created_at: string;
}

export type IndustryScheme = 'sw2021' | 'sw2014' | 'gics' | 'csrc' | 'custom';
export interface IndustryClassification {
  scheme: IndustryScheme;
  version: string;
  code: string;
  level: number;
  name_zh: string | null;
  name_en: string | null;
  parent_code: string | null;
}

export interface IssuerIndustryMembership {
  issuer_id: string;
  scheme: IndustryScheme;
  version: string;
  code: string;
  valid_from: string;
  valid_to: string | null;
  source: string;
  provenance: Record<string, unknown>;
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
      analyst_profiles: { Row: AnalystProfile; Insert: Partial<AnalystProfile>; Update: Partial<AnalystProfile> };
      recommendations: { Row: Recommendation; Insert: Partial<Recommendation>; Update: Partial<Recommendation> };
      recommendation_scores: { Row: RecommendationScore; Insert: Partial<RecommendationScore>; Update: Partial<RecommendationScore> };
      artifacts: { Row: Artifact; Insert: Partial<Artifact>; Update: Partial<Artifact> };
      usage_events: { Row: UsageEvent; Insert: Partial<UsageEvent>; Update: Partial<UsageEvent> };
      llm_cost_reservations: { Row: LlmCostReservation; Insert: Partial<LlmCostReservation>; Update: Partial<LlmCostReservation> };
      user_events: { Row: UserEvent; Insert: Partial<UserEvent>; Update: Partial<UserEvent> };
      ai_runs: { Row: AiRun; Insert: Partial<AiRun>; Update: Partial<AiRun> };
      service_alert_runs: { Row: ServiceAlertRun; Insert: Partial<ServiceAlertRun>; Update: Partial<ServiceAlertRun> };
      auth_email_probe_runs: { Row: AuthEmailProbeRun; Insert: Partial<AuthEmailProbeRun>; Update: Partial<AuthEmailProbeRun> };
      resend_webhook_events: { Row: ResendWebhookEvent; Insert: Partial<ResendWebhookEvent>; Update: Partial<ResendWebhookEvent> };
      stripe_events: { Row: StripeEvent; Insert: Partial<StripeEvent>; Update: Partial<StripeEvent> };
      ingest_batches: { Row: IngestBatch; Insert: Partial<IngestBatch>; Update: Partial<IngestBatch> };
      dq_quarantine: { Row: DqQuarantine; Insert: Partial<DqQuarantine>; Update: Partial<DqQuarantine> };
      dq_reconciliations: { Row: DqReconciliation; Insert: Partial<DqReconciliation>; Update: Partial<DqReconciliation> };
      dq_freshness: { Row: DqFreshness; Insert: Partial<DqFreshness>; Update: Partial<DqFreshness> };
      issuers: { Row: Issuer; Insert: Partial<Issuer>; Update: Partial<Issuer> };
      issuer_securities: { Row: IssuerSecurity; Insert: Partial<IssuerSecurity>; Update: Partial<IssuerSecurity> };
      issuer_identifier_claims: { Row: IssuerIdentifierClaim; Insert: Partial<IssuerIdentifierClaim>; Update: Partial<IssuerIdentifierClaim> };
      industry_classifications: { Row: IndustryClassification; Insert: Partial<IndustryClassification>; Update: Partial<IndustryClassification> };
      issuer_industry_memberships: { Row: IssuerIndustryMembership; Insert: Partial<IssuerIndustryMembership>; Update: Partial<IssuerIndustryMembership> };
      fact_sync_runs: { Row: FactSyncRun; Insert: Partial<FactSyncRun>; Update: Partial<FactSyncRun> };
      filings: { Row: Filing; Insert: Partial<Filing>; Update: Partial<Filing> };
      financial_facts: { Row: FinancialFact; Insert: Partial<FinancialFact>; Update: Partial<FinancialFact> };
      financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
      fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
    };
    Functions: {
      quote_alert_window_samples: {
        Args: { p_from: string; p_to: string };
        Returns: Array<{ event_name: string; metadata: { count: number | null; stale: number | null } }>;
      };
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
      commit_security_sync: {
        Args: { p_run_id: string };
        Returns: undefined;
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
