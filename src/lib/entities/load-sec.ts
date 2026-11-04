// Plan for loading US issuers and their listed securities from SEC company_tickers_exchange.json.
// Pure: no DB access. SEC exchange membership does not establish domicile and the file carries no
// share class, so country_code is never set and share_class is always 'unknown'.
import {normalizeSecurityTicker} from '../securities/ticker';
import type {SecExchangeRow} from '../research/entity-keys/parsers';

export const SEC_SOURCE='sec_company_tickers_exchange';

type FieldProvenance={source:string;as_of:string};
export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{exchange:string}}
export interface SecLoadPlan{issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}

/**
 * Keep rows whose normalized ticker is in the US universe. One issuer per CIK (first row's name);
 * the first kept ticker of a CIK in file order is primary. `skipped` lists raw tickers not in the universe.
 * A ticker repeated across rows is kept each time so the writer reports it as duplicate/conflict.
 */
export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,asOf:string):SecLoadPlan{
 const prov=():FieldProvenance=>({source:SEC_SOURCE,as_of:asOf});
 const issuers=new Map<string,PlannedIssuer>();
 const securities:PlannedSecurity[]=[];
 const skipped:string[]=[];
 for(const r of rows){
  const ticker=normalizeSecurityTicker(r.ticker,'US')??r.ticker.toUpperCase();
  if(!universe.has(ticker)){skipped.push(r.ticker);continue;}
  const first=!issuers.has(r.cik);
  if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{exchange:r.exchange}});
 }
 return {issuers:[...issuers.values()],securities,skipped};
}
