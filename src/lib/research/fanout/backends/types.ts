import type { JudgmentBackend } from '../../s4/ledger';
import type { SourceDocument, Thesis } from '../../types';
import type { QuestionId } from '../questions';

export interface FanoutInput {
  source: SourceDocument;
  theses: Thesis[];
  /** thesis_id → company names/aliases from the entity table (rule backend keyword source). */
  aliases: Map<string, string[]>;
  /** Q5 needs a cluster; false until WP-A5 assigns cluster_id. */
  askQ5: boolean;
}

export interface BackendAnswer {
  thesis_id: string;
  question_id: QuestionId;
  distribution: Record<string, number>;
  selected: string | null;
  confidence: number | null;
  abstained: boolean;
}

export interface BackendResult {
  backend: JudgmentBackend;
  backend_model: string;
  prompt_sha256: string | null;
  input_token_count: number | null;
  latency_ms: number;
  cost_micros: number;
  answers: BackendAnswer[];
  skipped?: 'disabled' | 'private_source' | 'error';
  error?: string;
}

export type FanoutBackend = (input: FanoutInput) => Promise<BackendResult>;
