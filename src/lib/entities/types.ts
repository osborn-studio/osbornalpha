// Issuer master-data shapes (spec 2026-11-04 data foundation §3.1–3.2).
export type HardIdType='lei'|'cik'|'usci';
/** id_type values allowed by the issuer_identifier_claims check constraint. */
export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id';
export interface IssuerIdentifiers{lei?:string|null;cik?:string|null;usci?:string|null;cninfo_org_id?:string|null}
export interface IssuerInput extends IssuerIdentifiers{
 canonical_name_zh?:string|null;canonical_name_en?:string|null;country_code?:string|null;hkex_stock_code_primary?:string|null;
 provenance?:Record<string,unknown>;
}
export interface Issuer extends IssuerInput{issuer_id:string;status:'active'|'merged'|'dissolved';merged_into?:string|null}
export type ShareClass='A'|'H'|'ADR'|'common'|'preferred'|'other'|'unknown';
export interface IssuerSecurityInput{issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;source:string;provenance?:Record<string,unknown>}
