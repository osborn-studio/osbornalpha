import type {ResearchState} from '../states';

/** Evidence kinds of evidence-ref/1 (topic spec 2026-11-16 section 4.1). */
export const EVIDENCE_KINDS = ['macro_observation','industry_metric','financial_fact','document_citation','broker_report_meta','judgment'] as const;
export type EvidenceKind = typeof EVIDENCE_KINDS[number];
/** Display-ready strings, except the two module-owned i18n keys. */
export interface SourceDrawerPayload {
  kind: EvidenceKind;
  identity: {id: string; label: string};
  source: {publisher: string; adapter: string; url: string | null; locator: string | null; evidence_sha256: string | null};
  times: {period: string; available_at: string; ingested_at: string | null};
  transform: {code_version: string | null; mapping_version: string | null; method_version: string | null};
  licence: {status: string; note_key: string};
  attribution_key: string;
  links: {module_href: string};
}
export const DRAWER_SECTIONS = ['identity','source','times','transform','licence','links'] as const;
export type DrawerSectionId = typeof DRAWER_SECTIONS[number];
export interface DrawerRow {key: string; label: string; value: string; mono?: boolean; href?: string; newTab?: boolean; state?: ResearchState}
export interface SourceDrawerExtras {
  title?: string;
  value?: string;
  period?: string;
  mark?: 'fact' | 'judgment';
  as_of?: string;
  relay?: string | null;
  evidence_href?: string;
  transform_label?: string;
  rows?: Partial<Record<DrawerSectionId, readonly DrawerRow[]>>;
  revisions?: readonly {period: string; value: string; available: string; version: string; current: boolean}[];
  links?: readonly {label: string; href: string; newTab?: boolean}[];
  states?: readonly ResearchState[];
}
export interface ValueAt {value: string; available_at: string}
/** Withheld and retracted inputs cannot carry a value. */
export type SourceDrawerInput =
  | {variant: 'ok'; payload: SourceDrawerPayload; extras?: SourceDrawerExtras}
  | {variant: 'revised'; payload: SourceDrawerPayload; extras?: SourceDrawerExtras; revised: {frozen: ValueAt; current: ValueAt}}
  | {variant: 'withheld'; kind: EvidenceKind; identity: {id: string; label: string}; reason: {code: string; text: string}}
  | {variant: 'retracted'; kind: EvidenceKind; identity: {id: string; label: string}; retraction: {category: string; at: string | null}};
export type DrawerText = (key: string) => string;
export type SourceDrawerAdapter<T> = (input: T) => SourceDrawerInput;
