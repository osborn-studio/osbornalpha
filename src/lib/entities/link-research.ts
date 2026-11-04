// Plans the promotion of ONE user's research entities (research_entity_keys/_securities) into the
// global issuer master. Pure: the script performs the writes. Only hard-identified entities
// (lei/usci/cik) are promoted; names only seed a newly created issuer (upsert enriches null fields).
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {isBlank} from './securities';
import type {IssuerInput,ShareClass} from './types';

type Market='A'|'HK'|'US'|'other';
export interface EntityKeyRow{user_id:string;entity_id:string;lei:string|null;usci:string|null;cik:string|null;cninfo_org_id:string|null;names_zh:unknown;names_en:unknown;home_market:Market;issuer_id:string|null}
export interface EntitySecurityRow{user_id:string;id:string;entity_id:string;exchange_code:string;isin:string|null;market:Market;security_type:'common'|'adr'|'preferred'|'other';is_primary:boolean;valid_from:string;valid_to:string|null}
export interface PlannedIssuer{entity_key:string;input:IssuerInput}
export interface PlannedSecurity{entity_key:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;source:'research_entity_securities'}
export interface SkippedLink{entity_key:string;security_id?:string;reason:string}
export interface PlannedLink{issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:SkippedLink[]}

const COUNTRY:Record<Market,string|null>={A:'CN',HK:'HK',US:'US',other:null};
const keyOf=(r:{user_id:string;entity_id:string})=>`${r.user_id}:${r.entity_id}`;
const str=(v:unknown)=>isBlank(v)?null:String(v).trim();
const firstName=(v:unknown)=>Array.isArray(v)?v.map(str).find((s):s is string=>typeof s==='string')??null:null;

function shareClass(s:EntitySecurityRow):ShareClass{
 if(s.security_type==='adr')return 'ADR';
 if(s.security_type!=='common')return s.security_type;
 return s.market==='A'?'A':s.market==='HK'?'H':s.market==='US'?'common':'unknown';
}

function ticker(s:EntitySecurityRow):string{
 const market=s.market!=='other'?s.market:inferCoreMarket(s.exchange_code);
 return (market&&normalizeSecurityTicker(s.exchange_code,market))||s.exchange_code.trim().toUpperCase();
}

export function planResearchLink(keys:EntityKeyRow[],securities:EntitySecurityRow[],universe:ReadonlySet<string>):PlannedLink{
 const plan:PlannedLink={issuers:[],securities:[],skipped:[]};
 const promoted=new Set<string>();
 for(const k of keys){
  const entity_key=keyOf(k);
  const ids={lei:str(k.lei),usci:str(k.usci),cik:str(k.cik)};
  if(!ids.lei&&!ids.usci&&!ids.cik){plan.skipped.push({entity_key,reason:'no_hard_identifier'});continue;}
  const fields={...ids,cninfo_org_id:str(k.cninfo_org_id),canonical_name_zh:firstName(k.names_zh),canonical_name_en:firstName(k.names_en)};
  const origin={source:'research_entity_keys',entity_id:k.entity_id,user_id:k.user_id};
  const provenance=Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==null).map(([f])=>[f,origin]));
  plan.issuers.push({entity_key,input:{lei:fields.lei,usci:fields.usci,cik:fields.cik,cninfo_org_id:fields.cninfo_org_id,canonical_name_zh:fields.canonical_name_zh,canonical_name_en:fields.canonical_name_en,country_code:COUNTRY[k.home_market]??null,provenance}});
  promoted.add(entity_key);
 }
 for(const s of securities){
  const entity_key=keyOf(s);
  if(!promoted.has(entity_key)){plan.skipped.push({entity_key,security_id:s.id,reason:'entity_not_promoted'});continue;}
  const t=ticker(s);
  if(!universe.has(t)){plan.skipped.push({entity_key,security_id:s.id,reason:`ticker_not_in_universe:${t}`});continue;}
  plan.securities.push({entity_key,security_id:s.id,ticker:t,isin:str(s.isin),share_class:shareClass(s),is_primary:s.is_primary===true,valid_from:s.valid_from,valid_to:s.valid_to??null,source:'research_entity_securities'});
 }
 return plan;
}
