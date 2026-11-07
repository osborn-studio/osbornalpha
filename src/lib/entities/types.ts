// src/lib/entities/types.ts
// Issuer master-data shapes (spec 2026-11-04 data foundation §3.1–3.2; spec 3 §3.1, §4.2.1; plan 3
// contract C2).
import type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
export type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
export type HardIdType='lei'|'cik'|'usci';
/** id_type values allowed by the issuer_identifier_claims check constraint. */
export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id'|'ticker';
export type ClaimOp='legacy'|'evidence_only'|'set_identifier'|'correct_identifier'|'attach_security'|'close_security'|'backdate_window';
/** Evidence class of a claim (facts vs judgments: a class, never a confidence number). */
export type EvidenceKind='hard_identifier'|'official_list'|'name_match'|'filing_form'|'provider_mapping';
export interface ClaimTarget{issuer_id:string;ticker?:string;valid_from?:string}
export interface ClaimEvidence{source:string;as_of:string;evidence_sha256:string;locator?:string;note?:string}
export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
export interface IssuerIdentifiers{lei?:string|null;cik?:string|null;usci?:string|null;cninfo_org_id?:string|null}
export interface IssuerInput extends IssuerIdentifiers{
 canonical_name_zh?:string|null;canonical_name_en?:string|null;country_code?:string|null;hkex_stock_code_primary?:string|null;
 provenance?:Record<string,unknown>;
}
export interface Issuer extends IssuerInput{issuer_id:string;status:'active'|'merged'|'dissolved';merged_into?:string|null}
/** What a writer carries so an ISIN contradiction can become a claim/1 claim (spec 3 §4.2.1). */
export interface SecurityClaimEvidence{kind:EvidenceKind;evidence:ClaimEvidence}
export interface IssuerSecurityInput{
 issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;
 /** default: source==='curated' ? 'curated' : 'first_observed' */
 valid_from_method?:ValidFromMethod;
 /** required when valid_to is set, absent/null otherwise */
 valid_to_method?:ValidToMethod|null;
 source:string;
 /** public: only PROVENANCE_KEYS (sanitizeProvenance) */
 provenance?:Record<string,unknown>;
 /** without it an ISIN contradiction is reported as 'conflict' but no claim is filed */
 claimEvidence?:SecurityClaimEvidence;
}
