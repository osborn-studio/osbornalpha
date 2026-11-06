// Promotes ONE user's research entities (research_entity_keys/_securities) into the global issuer
// master. planResearchLink is pure; applyResearchLink performs the writes through a TableClient and
// returns receipt counts (the script owns the ingest batch). Only entities with a valid hard
// identifier (lei/usci/cik) and a name are promoted. The public tables are anon-readable, so the
// public rows carry only source/as_of provenance: user and entity ids stay in the service-only
// receipt (tool_versions and error keys). The public provenance names the neutral source
// 'curated'; the research origin appears only in that receipt and its errors. Conflicts are parked
// as dq_quarantine rows of the run's batch.
import type {TableClient} from '../db/table-client';
import type {BatchError} from '../dq/batches';
import {emptyCounts} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
import {claimEvidence} from './claims';
import type {ApplyResult} from './load-sec';
import {errorMessage,issuerReasonCode,parkConflict,summarizeSkips,withSkippedSummary} from './load-sec';
import type {IssuerInput,SecurityClaimEvidence,ShareClass} from './types';

type Market='A'|'HK'|'US'|'other';
type CoreMarket=Exclude<Market,'other'>;
export interface EntityKeyRow{user_id:string;entity_id:string;lei:string|null;usci:string|null;cik:string|null;cninfo_org_id:string|null;names_zh:unknown;names_en:unknown;home_market:Market;issuer_id:string|null}
export interface EntitySecurityRow{user_id:string;id:string;entity_id:string;exchange_code:string;isin:string|null;market:Market;security_type:'common'|'adr'|'preferred'|'other';is_primary:boolean;valid_from:string;valid_to:string|null}
export interface PlannedIssuer{entity_key:string;user_id:string;entity_id:string;current_issuer_id:string|null;input:IssuerInput}
type CuratedOrigin={source:typeof CURATED;as_of:string};
export interface PlannedSecurity{entity_key:string;user_id:string;entity_id:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;valid_to_method:'curated'|null;source:typeof CURATED;provenance:{valid_from:CuratedOrigin;valid_to?:CuratedOrigin};claimEvidence:SecurityClaimEvidence}
export interface SkippedLink{entity_key:string;security_id?:string;reason:string}
export interface PlannedLink{fetched:number;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:SkippedLink[]}

/** Neutral public source name: the public rows never name the private research tables. */
export const CURATED='curated';
export const RESEARCH_LINK_DATASET=DATASETS.entities.researchLink;
const CORE:readonly string[]=['A','HK','US'];
const keyOf=(r:{user_id:string;entity_id:string})=>`${r.user_id}:${r.entity_id}`;
const str=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v.trim():null;
const firstName=(v:unknown)=>Array.isArray(v)?v.map(str).find((s):s is string=>s!==null)??null:null;
// B shares trade under A-share codes but are a different class.
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;
/**
 * Skip codes that mean invalid research data (→ rejectedSummary, degrades the batch). Every other
 * code is expected filtering (→ skippedSummary): no_hard_identifier and entity_not_promoted (not
 * promotable yet) and ticker_not_in_universe.
 */
const REJECT_CODES:readonly string[]=['invalid_identifier','name_required','invalid_ticker','market_mismatch'];
const isReject=(reason:string)=>REJECT_CODES.includes(reason.split(':')[0]);

type Ids={lei:string|null;usci:string|null;cik:string|null};
/** Validated hard ids, or the first invalid field. */
function hardIds(k:EntityKeyRow):Ids|{invalid:keyof Ids}{
 const lei=str(k.lei)?.toUpperCase()??null,usci=str(k.usci)?.toUpperCase()??null,rawCik=str(k.cik);
 if(lei!==null&&!isValidLei(lei))return {invalid:'lei'};
 if(usci!==null&&!isValidUsci(usci))return {invalid:'usci'};
 let cik:string|null=null;
 if(rawCik!==null){try{cik=normalizeCik(rawCik);}catch{return {invalid:'cik'};}}
 return {lei,usci,cik};
}

/**
 * Share class only from evidence: H needs an A-share home market or a USCI (a mainland issuer);
 * other HK common stock is 'unknown'. A-share codes with B-share prefixes are 'other'.
 */
function shareClass(s:EntitySecurityRow,ticker:string,entity:EntityKeyRow):ShareClass{
 if(s.security_type==='adr')return 'ADR';
 if(s.security_type!=='common')return s.security_type;
 if(s.market==='A')return B_SHARE.test(ticker)?'other':'A';
 if(s.market==='HK')return entity.home_market==='A'||str(entity.usci)!==null?'H':'unknown';
 return s.market==='US'?'common':'unknown';
}

/**
 * Ticker plus the market it was resolved in; null ticker when a core-market code does not parse.
 * The code as written (upper-cased, `/` read as `.`) wins when the universe lists it, as in
 * load-sec.ts, so `BRK.A` never collapses to `BRK` through Wind-suffix stripping.
 */
function resolveTicker(s:EntitySecurityRow,universe:ReadonlyMap<string,string>):{ticker:string|null;market:CoreMarket|null}{
 const exact=s.exchange_code.trim().toUpperCase().replace(/\//g,'.');
 const market=s.market!=='other'?s.market:inferCoreMarket(s.exchange_code);
 if(exact&&universe.has(exact))return {ticker:exact,market};
 if(s.market!=='other')return {ticker:normalizeSecurityTicker(s.exchange_code,s.market),market:s.market};
 return {ticker:(market&&normalizeSecurityTicker(s.exchange_code,market))||s.exchange_code.trim().toUpperCase(),market};
}

/**
 * `universe` maps stocks_universe tickers to their market. `asOf` (YYYY-MM-DD of the run) dates
 * the public issuer and security provenance.
 */
export function planResearchLink(keys:EntityKeyRow[],securities:EntitySecurityRow[],universe:ReadonlyMap<string,string>,asOf:string):PlannedLink{
 const plan:PlannedLink={fetched:keys.length,issuers:[],securities:[],skipped:[]};
 const promoted=new Map<string,EntityKeyRow>();
 for(const k of keys){
  const entity_key=keyOf(k);
  const ids=hardIds(k);
  if('invalid' in ids){plan.skipped.push({entity_key,reason:`invalid_identifier:${ids.invalid}`});continue;}
  if(!ids.lei&&!ids.usci&&!ids.cik){plan.skipped.push({entity_key,reason:'no_hard_identifier'});continue;}
  const canonical_name_zh=firstName(k.names_zh),canonical_name_en=firstName(k.names_en);
  if(!canonical_name_zh&&!canonical_name_en){plan.skipped.push({entity_key,reason:'name_required'});continue;}
  const fields={...ids,cninfo_org_id:str(k.cninfo_org_id),canonical_name_zh,canonical_name_en,country_code:ids.usci?'CN':null};
  const origin={source:CURATED,as_of:asOf};
  const provenance=Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==null).map(([f])=>[f,{...origin}]));
  plan.issuers.push({entity_key,user_id:k.user_id,entity_id:k.entity_id,current_issuer_id:str(k.issuer_id),input:{...fields,provenance}});
  promoted.set(entity_key,k);
 }
 for(const s of securities){
  const entity_key=keyOf(s);
  const skip=(reason:string)=>plan.skipped.push({entity_key,security_id:s.id,reason});
  const entity=promoted.get(entity_key);
  if(!entity){skip('entity_not_promoted');continue;}
  const {ticker:t,market}=resolveTicker(s,universe);
  if(!t){skip(`invalid_ticker:${s.exchange_code}`);continue;}
  const listed=universe.get(t);
  if(listed===undefined){skip(`ticker_not_in_universe:${t}`);continue;}
  if(market&&CORE.includes(listed)&&listed!==market){skip(`market_mismatch:${t}`);continue;}
  const isin=str(s.isin),share_class=shareClass(s,t,entity),valid_to=s.valid_to??null;
  const origin:CuratedOrigin={source:CURATED,as_of:asOf};
  // The claim evidence hashes only public security fields (never user or entity ids).
  const record={ticker:t,isin,share_class,valid_from:s.valid_from,valid_to};
  plan.securities.push({entity_key,user_id:s.user_id,entity_id:s.entity_id,security_id:s.id,ticker:t,isin,share_class,is_primary:s.is_primary===true,
   valid_from:s.valid_from,valid_to,valid_to_method:valid_to===null?null:'curated',source:CURATED,
   provenance:valid_to===null?{valid_from:{...origin}}:{valid_from:{...origin},valid_to:{...origin}},
   claimEvidence:{kind:'provider_mapping',evidence:claimEvidence({source:CURATED,asOf,record,note:'curated research security'})}});
 }
 return plan;
}

/**
 * Writes the plan for `userId` only (every private update matches on user_id). A public write is
 * counted before its private link update; a link update that does not hit exactly one row adds a
 * failure (`link_failed`). Securities whose issuer failed, was quarantined or could not be linked
 * count as failed (`blocked_by_issuer`). Issuer conflicts (key: the first hard id, cik/lei/usci) and
 * ownership conflicts (key: `ticker:valid_from`) are quarantined under `opts.batchId` with the
 * rejected input as payload; the entity key stays in the service-only quarantine detail/payload.
 * Expected filtering is summarized in `skipped_summary`, invalid data (REJECT_CODES) in
 * `rejected_summary`.
 */
export async function applyResearchLink(client:TableClient,plan:PlannedLink,opts:{userId:string;batchId:string}):Promise<ApplyResult>{
 const user_id=opts.userId;
 if([...plan.issuers,...plan.securities].some(i=>i.user_id!==user_id))throw new Error('plan_user_mismatch');
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 counts.fetched=plan.fetched;
 const skippedSummary=summarizeSkips(plan.skipped.filter(s=>!isReject(s.reason)).map(s=>s.reason));
 const rejectedSummary=summarizeSkips(plan.skipped.filter(s=>isReject(s.reason)).map(s=>s.reason));
 const finish=():ApplyResult=>({counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary});
 if(plan.issuers.length===0){
  errors.push({code:'empty_plan',message:'no research entity qualified for promotion'});
  return finish();
 }

 const issuerByEntity=new Map<string,string>();
 for(const {entity_key,entity_id,current_issuer_id,input} of plan.issuers){
  let res;
  try{res=await upsertIssuerByIdentifiers(client,input);}
  catch(e){counts.failed++;errors.push({code:'issuer_error',key:entity_key,message:errorMessage(e)});continue;}
  if(res.conflict||!res.issuer_id){
   const naturalKey=String(input.cik??input.lei??input.usci);
   const payload={lei:input.lei??null,usci:input.usci??null,cik:input.cik??null,cninfo_org_id:input.cninfo_org_id??null,canonical_name_zh:input.canonical_name_zh??null,canonical_name_en:input.canonical_name_en??null};
   await parkConflict(client,{dataset:RESEARCH_LINK_DATASET,table:'issuers',naturalKey,reasonCode:issuerReasonCode(res.reason),detail:{reason:res.reason??null,entity_key},payload,batchId:opts.batchId},counts,errors,{code:'issuer_conflict',key:entity_key,message:res.reason});
   continue;
  }
  if(res.created)counts.inserted++;else counts.duplicates++;
  if(current_issuer_id&&current_issuer_id!==res.issuer_id)errors.push({code:'relink',key:entity_key,message:`${current_issuer_id}->${res.issuer_id}`});
  try{
   const n=await client.update('research_entity_keys',{user_id,entity_id},{issuer_id:res.issuer_id});
   if(n!==1){counts.failed++;errors.push({code:'link_failed',key:entity_key,message:`expected 1 row, updated ${n}`});continue;}
  }catch(e){counts.failed++;errors.push({code:'link_failed',key:entity_key,message:errorMessage(e)});continue;}
  issuerByEntity.set(entity_key,res.issuer_id);
 }

 for(const sec of plan.securities){
  const {entity_key,security_id,user_id:_u,entity_id:_e,...rest}=sec;
  const key=`${entity_key}:${security_id}`;
  const issuer_id=issuerByEntity.get(entity_key);
  if(!issuer_id){counts.failed++;errors.push({code:'blocked_by_issuer',key,message:sec.ticker});continue;}
  let res;
  try{res=await attachSecurity(client,{...rest,issuer_id});}
  catch(e){
   counts.failed++;
   const msg=errorMessage(e);
   errors.push({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key,message:msg});
   continue;
  }
  if(res==='conflict'){
   const payload={ticker:sec.ticker,isin:sec.isin,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:sec.valid_to,entity_key:key};
   await parkConflict(client,{dataset:RESEARCH_LINK_DATASET,table:'issuer_securities',naturalKey:`${sec.ticker}:${sec.valid_from}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',entity_key:key},payload,batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key,message:sec.ticker});
   continue;
  }
  if(res==='inserted')counts.inserted++;else counts.duplicates++;
  try{
   const n=await client.update('research_entity_securities',{user_id,id:security_id},{ticker:sec.ticker});
   if(n!==1){counts.failed++;errors.push({code:'link_failed',key,message:`expected 1 row, updated ${n}`});}
  }catch(e){counts.failed++;errors.push({code:'link_failed',key,message:errorMessage(e)});}
 }
 return finish();
}
