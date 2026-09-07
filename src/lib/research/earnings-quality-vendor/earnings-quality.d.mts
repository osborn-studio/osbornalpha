export interface Period { start: string; end: string }
export type Metric = 'revenue' | 'net_income' | 'operating_cash_flow' | 'capex';
export interface Source { id: string; title: string; url: string; filedAt: string }
export interface Fact {
  id: string; metric: Metric; role: 'actual' | 'estimate'; value: number;
  entity: string; period: Period; currency: string; unit: 'ones' | 'thousands' | 'millions';
  basis: string; sourceId: string; locator: string;
}
export interface Thesis {
  id: string; text: string; createdAt: string;
  rule?: { metric: 'cash_conversion' | 'net_margin'; operator: 'gte' | 'lte'; threshold: number };
}
export interface QualityInput {
  schemaVersion: '1'; entity: string; asOf: string;
  periods: { current: Period; prior: Period };
  sources: Source[]; facts: Fact[]; thesis: Thesis[];
}
export interface Measure {
  status: 'computed' | 'unavailable'; value: number | null; reason: string | null;
  formula: string; factIds: string[];
}
export interface QualityOutput {
  engineVersion: string; skillId: string; coverage: 'sourced-facts-deterministic';
  entity: string; asOf: string; requiresHumanReview: true;
  current: { cashConversion: Measure; netMargin: Measure; cashLessCapex: Measure };
  prior: { cashConversion: Measure; netMargin: Measure; cashLessCapex: Measure };
  changes: Record<Metric, { absolute: Measure; growth: Measure }>;
  cashRelation: { relation: 'greater' | 'equal' | 'less' | 'unavailable'; text: string; factIds: string[] };
  thesis: { id: string; text: string; prior: 'met' | 'breached' | 'unassessed'; current: 'met' | 'breached' | 'unassessed'; transition: string; factIds: string[]; reason: string | null }[];
  warnings: string[]; sources: Source[]; facts: Fact[];
}
export const ENGINE_VERSION: string;
export function validateInput(input: unknown): QualityInput;
export function analyzeEarnings(input: unknown): QualityOutput;
export interface SecOptions {
  cik: number; asOf: string; current: Period; prior: Period;
  accession: string; thesis?: Thesis[];
}
export function fromSecCompanyFacts(raw: unknown, options: SecOptions): QualityInput;
