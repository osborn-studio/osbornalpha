/**
 * Research OS domain types (Phase 1).
 * Mirrors docs/research-os/product-technical-spec.md §6, SQLite-ized:
 * array/object fields are stored as JSON TEXT columns and (de)serialized
 * through the readJson/writeJson helpers below.
 */

export type EntityType =
  | 'COMPANY'
  | 'PERSON'
  | 'PRODUCT'
  | 'MODEL'
  | 'REPOSITORY'
  | 'SUPPLY_CHAIN_NODE'
  | 'EVENT'
  | 'THEME';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  ticker?: string | null;
  description?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type SourceType =
  | 'GITHUB_RADAR'
  | 'MODEL_USAGE'
  | 'EARNINGS_CALL'
  | 'NEWS'
  | 'FILING'
  | 'NOTE'
  | 'MANUAL';

export const SOURCE_TYPES: readonly SourceType[] = [
  'GITHUB_RADAR', 'MODEL_USAGE', 'EARNINGS_CALL', 'NEWS', 'FILING', 'NOTE', 'MANUAL',
] as const;

export type TrustLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** WP-A1 (plan 2026-09-22 §5.1): provenance and permission facets of a source. */
export const ORIGIN_TYPES = [
  'filing', 'company_statement', 'third_party_data', 'analyst_or_media', 'retelling', 'private_observation', 'unknown',
] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];
export const MARKETS = ['A', 'HK', 'US', 'other'] as const;
export type Market = (typeof MARKETS)[number];
/** Only `public` sources may ever be sent to Jev. */
export const PERMISSIONS = ['public', 'licensed', 'private'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface SourceDocument {
  id: string;
  source_type: SourceType;
  title: string;
  url?: string | null;
  author?: string | null;
  published_at?: string | null;
  ingested_at: string;
  raw_text: string;
  content_hash: string;
  trust_level: TrustLevel;
  entity_ids: string[];
  metadata?: Record<string, unknown>;
  // WP-A1 facets. Optional in the type so pre-migration fixtures and prompt
  // tests keep compiling; rowToSource and the database always populate them.
  /** Event date the document describes, when known. */
  event_time?: string | null;
  /** First instant we could have obtained it; immutable once written. */
  available_at?: string;
  /** Vintage counter for the same URL; immutable once written. */
  source_version?: string;
  cluster_id?: string | null;
  cluster_first?: boolean | null;
  origin_type?: OriginType | null;
  market?: Market | null;
  permission?: Permission;
}

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** One evidence bullet inside a memo; must cite source documents or be LOW_CONFIDENCE. */
export interface EvidenceItem {
  claim: string;
  source_document_ids: string[];
  /** Set when the claim has no backing source (compliance red line). */
  low_confidence?: boolean;
}

export type AxiomSeverity = 'BLOCK' | 'WARN';

export interface Axiom {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: AxiomSeverity;
  enabled: boolean;
  created_at: string;
}

export interface AxiomCheckResult {
  axiom_code: string;
  severity: AxiomSeverity;
  passed: boolean;
  message: string;
}

export interface MemoEdit {
  at: string;
  fields: string[];
}

export interface MemoProvenance {
  model?: string;
  prompt_sha256?: string;
  source_document_ids?: string[];
  generated_at?: string;
  edits?: MemoEdit[];
}

export type MemoStatus = 'DRAFT' | 'REVIEWED' | 'ARCHIVED';

export interface InvestmentMemo {
  id: string;
  title: string;
  company_ids: string[];
  theme_ids: string[];
  one_line_conclusion: string;
  thesis: string;
  supporting_evidence: EvidenceItem[];
  counter_arguments: EvidenceItem[];
  key_variables: string[];
  invalidation_conditions: string[];
  open_questions: string[];
  /** §4.4-8 相关公司/产业链影响 */
  related_impacts: string[];
  confidence: Confidence;
  axiom_check_results: AxiomCheckResult[];
  provenance: MemoProvenance;
  status: MemoStatus;
  created_at: string;
  updated_at: string;
  // --- Deal-memo (memo_type='deal') additive fields (T4). Optional so existing
  // thesis-memo reads are unaffected; a thesis memo defaults memo_type='thesis'
  // and leaves these empty. ---
  memo_type?: MemoType;
  deal_context?: string | null;
  sections?: DealSection[];
  recommendation?: DealRecommendation;
  valuation?: DealValuation;
}

// ---------------------------------------------------------------------------
// Deal memo (一级市场兼容 IC memo) — additive memo_type='deal' variant.
// Spec: docs/research-os/2026-07-06-ic-memo-deal-variant-spec.md. The
// primary-market valuation system (8 fields) is the core: schema/prompt/types/UI
// MUST structurally carry all 8 fields even when empty (rendered 待核实/未提供,
// never hidden). public_market_crosscheck is a CHECK only — it must never
// override primary-market valuation logic.

export type MemoType = 'thesis' | 'deal';

/** One of the 8 narrative sections; claims tagged fact / assumption / inference. */
export interface DealSection {
  id: string;
  title: string;
  body_md: string;
  tags: { facts: string[]; assumptions: string[]; inferences: string[] };
}

/** Primary-market entry valuation — every sub-field nullable (待核实 when absent). */
export interface DealEntryValuation {
  pre_money?: number | null;
  post_money?: number | null;
  ev?: number | null;
  equity_value?: number | null;
  per_share?: number | null;
  transaction_value?: number | null;
  currency?: string | null;
}

export interface DealOwnershipAndDilution {
  stake_pct?: number | null;
  dilution?: string | null;
  swap_or_raise_note?: string | null;
}

export interface DealReturnScenarios {
  base?: string | null;
  upside?: string | null;
  downside?: string | null;
}

export interface DealReturnProfile {
  irr?: number | null;
  moic?: number | null;
  payback?: string | null;
  scenarios?: DealReturnScenarios;
}

export interface DealExitPath {
  type: string;   // 'IPO' | '并购转让' | '回购' | '二级转让' | string
  window?: string | null;
}

export interface DealExitAssumptions {
  paths: DealExitPath[];
}

export interface DealSensitivityItem {
  variable: string;
  effect: string;
}

export interface DealValuationRisk {
  risk: string;
  mitigant: string;
}

export interface DealComp {
  ticker?: string | null;
  name?: string | null;
  multiple?: string | null;
}

/** Secondary-market crosscheck — a CHECK only, never overrides primary logic. */
export interface DealPublicMarketCrosscheck {
  applicable: boolean;
  comps: DealComp[];
  note?: string | null;
}

/** The structured primary-market valuation system — all 8 fields always present. */
export interface DealValuation {
  valuation_basis: string[];
  entry_valuation: DealEntryValuation;
  ownership_and_dilution: DealOwnershipAndDilution;
  return_profile: DealReturnProfile;
  exit_assumptions: DealExitAssumptions;
  sensitivity: DealSensitivityItem[];
  valuation_risks: DealValuationRisk[];
  public_market_crosscheck: DealPublicMarketCrosscheck;
}

export type DealVerdict = 'invest' | 'pass' | 'conditional';

export interface DealRecommendation {
  verdict: DealVerdict;
  conditions: string[];
  rationale: string;
}

/** LLM draft shape for a deal memo (pre-persist). */
export interface DealMemoDraft {
  title: string;
  sections: DealSection[];
  recommendation: DealRecommendation;
  valuation: DealValuation;
}

// ---------------------------------------------------------------------------
// Signals (Phase 2)

export type SignalType =
  | 'DEVELOPER'
  | 'MODEL_USAGE'
  | 'PRODUCT'
  | 'COMPANY'
  | 'SUPPLY_CHAIN'
  | 'POLICY';

export const SIGNAL_TYPES: readonly SignalType[] = [
  'DEVELOPER', 'MODEL_USAGE', 'PRODUCT', 'COMPANY', 'SUPPLY_CHAIN', 'POLICY',
] as const;

export type SignalDirection = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';

export const SIGNAL_DIRECTIONS: readonly SignalDirection[] = [
  'POSITIVE', 'NEGATIVE', 'MIXED', 'UNKNOWN',
] as const;

/** Per-row LLM provenance for generated artifacts (signals, monitor alerts). */
export interface LlmProvenance {
  model?: string;
  prompt_sha256?: string;
  generated_at?: string;
}

export interface Signal {
  id: string;
  title: string;
  summary: string;
  signal_type: SignalType;
  direction: SignalDirection;
  confidence: Confidence;
  entity_ids: string[];
  source_document_ids: string[];
  affected_company_ids: string[];
  research_questions: string[];
  /** v2 — extraction bookkeeping, e.g. {unmatched_names, unmatched_company_names}. */
  metadata: Record<string, unknown>;
  /** v2 — LLM provenance for the extraction that produced this row. */
  llm_provenance: LlmProvenance;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Theses (Phase 2)

export type ThesisStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'WATCH'
  | 'AT_RISK'
  | 'INVALIDATED'
  | 'CLOSED';

export const THESIS_STATUSES: readonly ThesisStatus[] = [
  'DRAFT', 'ACTIVE', 'WATCH', 'AT_RISK', 'INVALIDATED', 'CLOSED',
] as const;

/**
 * Allowed status transitions (plan T3). Anything not listed → 422.
 * Lives in types.ts (client-safe module) so pages can render only legal
 * actions; transitionThesis() in theses.ts is the single enforcement point.
 */
export const THESIS_TRANSITIONS: Readonly<Record<ThesisStatus, readonly ThesisStatus[]>> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['WATCH', 'AT_RISK', 'INVALIDATED', 'CLOSED'],
  WATCH: ['ACTIVE', 'AT_RISK', 'INVALIDATED', 'CLOSED'],
  AT_RISK: ['ACTIVE', 'WATCH', 'INVALIDATED', 'CLOSED'],
  INVALIDATED: ['CLOSED'],
  CLOSED: [],
};

export interface Thesis {
  id: string;
  title: string;
  body: string;
  company_ids: string[];
  theme_ids: string[];
  supporting_evidence_ids: string[];
  /** ≥1 required at creation — AX001 spirit: 无失效条件不允许存在. */
  invalidation_conditions: string[];
  /** ≥1 required at creation. */
  watch_metrics: string[];
  status: ThesisStatus;
  next_review_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ThesisEventType =
  | 'SUPPORT'
  | 'WEAKEN'
  | 'INVALIDATE'
  | 'STATUS_CHANGE'
  | 'NOTE';

export interface ThesisEvent {
  id: string;
  thesis_id: string;
  event_type: ThesisEventType;
  /** JSON detail; STATUS_CHANGE: {from,to,reason} — monitor alerts: {rationale, cited_signal_ids, suggested_status, pending, ...}. */
  detail: Record<string, unknown>;
  source_document_ids: string[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Playbooks (Phase 3)

export type ProposedAction =
  | 'WATCHLIST'
  | 'PAPER_TRADE'
  | 'RESEARCH_MORE'
  | 'UPDATE_THESIS'
  | 'CLOSE_THESIS';

export const PROPOSED_ACTIONS: readonly ProposedAction[] = [
  'WATCHLIST', 'PAPER_TRADE', 'RESEARCH_MORE', 'UPDATE_THESIS', 'CLOSE_THESIS',
] as const;

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED',
] as const;

/**
 * One audited playbook run (spec §3.4). PAPER_TRADE is a RECORD ONLY —
 * nothing in Research OS ever touches a brokerage or executes a real trade.
 */
export interface PlaybookRun {
  id: string;
  memo_id?: string | null;
  thesis_id?: string | null;
  proposed_action: ProposedAction;
  rationale: string;
  risks: string[];
  approval_status: ApprovalStatus;
  human_decision?: string | null;
  review_at?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Evals (Phase 4)

/**
 * §4.4 memo draft shape — the eval gen output and the memo generator output
 * share this exact structure (client-safe home; memo-prompt re-exports it).
 */
export interface MemoDraft {
  title: string;
  one_line_conclusion: string;
  thesis: string;
  supporting_evidence: EvidenceItem[];
  counter_arguments: EvidenceItem[];
  key_variables: string[];
  invalidation_conditions: string[];
  open_questions: string[];
  related_impacts: string[];
  confidence: Confidence;
}

/**
 * Default 6-dimension rubric (spec §4.8), dimension → weight (equal).
 * overconfidence is REVERSE-scored: the more unfounded confidence the memo
 * shows, the LOWER the score. Cases may override via eval_cases.rubric.
 */
export const DEFAULT_EVAL_RUBRIC: Readonly<Record<string, number>> = {
  factual_accuracy: 1,
  citation_quality: 1,
  counter_arguments: 1,
  risk_identification: 1,
  invalidation_quality: 1,
  overconfidence: 1,
};

export interface EvalCase {
  id: string;
  title: string;
  /** Historical point in time (YYYY-MM-DD) the agent is boxed into. */
  as_of: string;
  /** source_document ids visible to the agent at as_of. */
  visible_material: string[];
  /** What actually happened afterwards — the judge's ground truth. */
  expected: { notes: string };
  /** Optional free-form outcome record (what actually happened). */
  outcome: string;
  /** dimension → weight. */
  rubric: Record<string, number>;
  created_at: string;
}

/** Full agent output + double provenance persisted on eval_runs.output. */
export interface EvalRunOutput {
  memo: MemoDraft;
  rationale_per_dimension: Record<string, string>;
  /** builder≠judge: two separate LLM calls, both provenances kept. */
  provenance: { gen: LlmProvenance; judge: LlmProvenance };
}

export interface EvalRun {
  id: string;
  case_id: string;
  output: EvalRunOutput;
  /** dimension → 0-10 (validated + clamped). */
  scores: Record<string, number>;
  /** Weighted mean of scores under the case rubric. */
  total: number;
  failure_modes: string[];
  created_at: string;
}

/**
 * Honest limitation statement (spec Phase 4) — rendered VERBATIM as the Eval
 * Lab footnote. Do not reword.
 */
export const EVAL_TIMEBOX_LIMITATION =
  '已知局限：预训练 LLM 自带 as_of_date 之后的世界知识，无法真正"时间盒"——缓解手段=生成 prompt 强制"假设今天是 {as_of_date}，只准使用提供材料，材料外断言一律标 LOW_CONFIDENCE"，评审维度"引用质量/过度自信"专门惩罚无据断言。这不是完美回测，是研究纪律评测。';

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: string;
  target_id?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/** Mandatory disclaimer for every memo render/export (spec §4.6/§9). */
export const RESEARCH_DISCLAIMER =
  '本内容为研究辅助，不构成投资建议。This content is research assistance only and does not constitute investment advice.';

// ---------------------------------------------------------------------------
// JSON column helpers — SQLite stores arrays/objects as TEXT.

/** Parse a JSON TEXT column; returns fallback on null/invalid content. */
export function readJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Serialize a value into a JSON TEXT column. */
export function writeJson<T>(value: T): string {
  return JSON.stringify(value ?? null);
}
