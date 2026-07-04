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
  confidence: Confidence;
  axiom_check_results: AxiomCheckResult[];
  provenance: MemoProvenance;
  status: MemoStatus;
  created_at: string;
  updated_at: string;
}

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
