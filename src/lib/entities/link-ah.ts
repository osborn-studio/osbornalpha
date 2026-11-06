// src/lib/entities/link-ah.ts
// A+H linking (spec §4.2.2). Rule 1 (automatic, hard_identifier): an issuer's LEI → GLEIF ISINs →
// OpenFIGI HK line that is in stocks_universe and held by nobody → attachSecurity at the listing
// date (listing_date) or the run date (first_observed); held by another issuer → ownership_conflict.
// Rule 2 (claims only, name_match): an issuer holding A-share rows, no H row and a name, whose
// normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
// only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
// waits for a confirmed source (spec §14-1).
// OpenFIGI tickers are HINTS: one ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK,
// TCTZF). Hits are classified first (superseded -OLD counters, non-equity, not in universe are
// dropped and summarised), then grouped per (issuer, ticker) and decided deterministically:
//   - automatic attach ONLY on hard identifiers: HKEX ISIN of the stock code == the hit's ISIN
//     (and no conflicting hit for that ticker);
//   - every other in-universe HK hit not held by the issuer (no HKEX ISIN, HKEX/GLEIF ISIN
//     disagreement, a second H line, ambiguous ISINs) becomes an attach_security claim
//     (provider_mapping) with all evidence, a ticker-level FIGI lookup being evidence only;
//   - a ticker open at another issuer is an ownership_conflict quarantine.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {fileClaim,type ClaimInput} from './claims';
import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
import {groupFigiResults,type FigiEvidence,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
import {rawPath} from '../dq/raw-store';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';
import {attachSecurity} from './securities';
import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';

/** HKEX list Category value for ordinary equity, compared lower-cased and EXACTLY (live categories include "Equity Warrants…" and "Real Estate Investment Trusts"). */
export const HKEX_EQUITY_CATEGORY='equity';
export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;requestSha256?:string;responseSha256:string;index:number;lei:string}
export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
/** A ticker-level OpenFIGI lookup: evidence only, never grounds for an automatic attach. */
export interface TickerLookup{figi:string;level:'composite'|'venue';evidence:FigiEvidence}
/** A per-job OpenFIGI `error` result (not `not_found`): the batch must fail with its evidence. */
export interface FigiJobError{isin:string;lei:string;message:string;evidence:FigiEvidence}
export interface AhLinkInput{
 asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
 universe:ReadonlyMap<string,UniverseListing>;
 /** ticker → issuer_id of its open row */
 openOwner:ReadonlyMap<string,string>;
 hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
 /** 5-digit stock code → ISIN (mergeHkexIsins): the hard identifier for automatic attach */
 hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
 /** 5-digit codes of superseded (-OLD) counters dropped by mergeHkexIsins */
 hkexSuperseded?:ReadonlySet<string>;
 tickerLookup?:ReadonlyMap<string,TickerLookup>;
 figiErrors?:readonly FigiJobError[];
 /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
 raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
}
export interface AhLinkPlan{
 attaches:IssuerSecurityInput[];
 /** planned evidence per attach, keyed `${issuer_id}|${ticker}`: kept in the quarantine if the apply-time insert conflicts */
 attachEvidence:Record<string,Record<string,unknown>>;
 conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[];figiErrors:FigiJobError[];
}

const SUPERSEDED=/-\s*old$/i;
export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';

/**
 * Issuers a run considers. Rule 1 needs only a LEI (share_class falls back to 'unknown'); rule 2
 * and the 'H' share class need A-share rows, which planAhLinks enforces itself.
 */
export function selectAhIssuers(issuers:readonly {issuer_id:string;lei:string|null;usci:string|null;names:string[]}[],openTickers:readonly {issuer_id:string;ticker:string}[]):AhIssuer[]{
 const by=new Map<string,string[]>();
 for(const t of openTickers)by.set(t.issuer_id,[...(by.get(t.issuer_id)??[]),t.ticker]);
 return issuers.map(i=>{
  const ts=by.get(i.issuer_id)??[];
  return {issuer_id:i.issuer_id,lei:i.lei,usci:i.usci,names:i.names,aTickers:ts.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:ts.filter(t=>/^\d{5}\.HK$/.test(t))};
 }).filter(i=>i.lei!==null||i.aTickers.length>0);
}

/** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
 const out:AhFigiHit[]=[];
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='ok')continue;
   for(const c of groupFigiResults(r.records).candidates){
    if(c.market!=='HK')continue;
    const one=c.groups.length===1?c.groups[0]:null;
    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,requestSha256:r.evidence.request_sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
   }
  }
 }
 return out;
}

/** Per-job `error` results for the issuers' ISINs (`not_found` is a normal outcome and is not listed). */
export function figiErrorsFromResults(issuers:readonly AhIssuer[],gleif:{byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):FigiJobError[]{
 const out:FigiJobError[]=[];const seen=new Set<string>();
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='error'||seen.has(isin))continue;
   seen.add(isin);out.push({isin,lei:i.lei,message:r.message.slice(0,200),evidence:r.evidence});
  }
 }
 return out.sort((a,b)=>a.isin<b.isin?-1:1);
}

function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
 if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
 return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
}
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

type Kind='hard'|'disagree'|'soft';
type Classified={skip:string}|{kind:Kind;hk:HkexIsin|null};
/** Per-hit gate, in this order: superseded counter (rejected before any validation), non-equity, not in universe; then hard / disagree / soft. */
function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
 const code=h.ticker.slice(0,5);
 const k=input.hkexIsins?.get(code)??null;
 const rows=input.hkex?.rows.filter(r=>r.stockCode===code)??[];
 const live=rows.filter(r=>!SUPERSEDED.test((r.name??'').trim()));
 if((rows.length>0&&live.length===0)||(!k&&input.hkexSuperseded?.has(code)))return {skip:'superseded_counter'};
 if(live.length>0&&!live.some(r=>r.category?.trim().toLowerCase()===HKEX_EQUITY_CATEGORY))return {skip:'not_equity'};
 if(!input.universe.has(h.ticker))return {skip:'ticker_not_in_universe'};
 if(!k)return {kind:'soft',hk:null};
 return {kind:k.isin===h.isin?'hard':'disagree',hk:k};
}

export function planAhLinks(input:AhLinkInput):AhLinkPlan{
 const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
 const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
 const linked=new Set<string>();
 // 1. classify every hit (order independent), 2. group per (issuer, ticker), 3. decide per group
 const groups=new Map<string,{issuer:AhIssuer;ticker:string;hits:{h:AhFigiHit;c:{kind:Kind;hk:HkexIsin|null}}[]}>();
 const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
 for(const h of hits){
  const issuer=byId.get(h.issuer_id);
  if(!issuer)continue;
  const c=classifyHit(h,input);
  if('skip' in c){plan.skipped.push(c.skip);continue;}
  const k=`${h.issuer_id}|${h.ticker}`;
  const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
  g.hits.push({h,c});groups.set(k,g);
 }
 for(const k of [...groups.keys()].sort()){
  const {issuer:i,ticker,hits:gh}=groups.get(k)!;
  const u=input.universe.get(ticker)!;
  const owner=input.openOwner.get(ticker);
  if(owner===i.issuer_id||i.hTickers.includes(ticker)){plan.skipped.push('already_attached');linked.add(i.issuer_id);continue;}
  const first=gh[0].h;
  const g0=input.raw?.gleif,hk0=input.raw?.hkex;
  const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
   ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
  const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
  if(owner!==undefined){
   plan.conflicts.push({naturalKey:`${ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence},
    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin}});
   linked.add(i.issuer_id);continue;
  }
  const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
  const hard=gh.filter(x=>x.c.kind==='hard');
  const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
  const l=listing(u,input.asOf);
  const figiHit=gh.find(x=>x.h.figi);
  if(auto){
   const hk=hard[0].c.hk!;const h=hard[0].h;
   const provenance=sanitizeProvenance({
    isin:{source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${hk.row}`,
     corroborated_by:[{source:'gleif_openfigi',evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`}]},
    ...(figiHit?.h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:figiHit.h.responseSha256,job:jobOf(figiHit.h.job),level:figiHit.h.level}}:{}),
    ...l.prov,
   });
   plan.attaches.push({issuer_id:i.issuer_id,ticker,isin:h.isin,figi:figiHit?.h.figi??null,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
   plan.attachEvidence[k]={rule:'same_lei',validated_by:'hkex_isin',evidence:rawEvidence,isin:h.isin};
   linked.add(i.issuer_id);continue;
  }
  // claim: everything not backed by an HKEX ISIN equal to the GLEIF/OpenFIGI one
  const sources:ClaimEvidence[]=[];
  const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
  for(const {h,c} of gh){
   add({source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
    note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
   if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
    note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
  }
  const tl=input.tickerLookup?.get(ticker);
  if(tl)add({source:'openfigi_ticker',as_of:input.asOf,evidence_sha256:tl.evidence.response_sha256,locator:`openfigi:${tl.evidence.response_sha256}#${tl.evidence.index}`,
   note:`ticker-level lookup FIGI ${tl.figi} (${tl.level}); request ${tl.evidence.request_sha256}; ${figiHit?.h.figi?(tl.figi===figiHit.h.figi?'matches':'differs from')+` ISIN-level FIGI ${figiHit.h.figi}`:'no ISIN-level FIGI to compare'}`});
  const why=i.hTickers.length>0?'issuer already holds an H line':kinds.includes('disagree')?'HKEX and GLEIF/OpenFIGI ISINs disagree':isins.length>1?'several ISINs map to this ticker':'no HKEX ISIN confirms this listing';
  const evidence:ClaimEvidence={...sources[0],note:`${sources[0].note??''}; review: ${why}`.slice(0,500)};
  sources[0]=evidence;
  plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'gleif_openfigi',op:'attach_security',detail:{
   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:i.issuer_id},
   params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
   evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
  }});
  linked.add(i.issuer_id);
 }
 if(input.hkex){
  const hk=input.hkex;
  const byName=new Map<string,HkexListRow[]>();
  for(const r of hk.rows){
   if(r.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY||!r.name||SUPERSEDED.test(r.name.trim()))continue;
   const n=normalizeCompanyName(r.name);
   if(!n)continue;
   byName.set(n,[...(byName.get(n)??[]),r]);
  }
  for(const i of input.issuers){
   if(linked.has(i.issuer_id)||i.aTickers.length===0||i.hTickers.length>0)continue;
   const names=new Set(i.names.map(normalizeCompanyName).filter(n=>n!==''));
   if(!names.size){plan.skipped.push('name_match_no_name');continue;}
   const codes=new Map<string,HkexListRow>();
   for(const n of names)for(const r of byName.get(n)??[])codes.set(r.stockCode,r);
   if(codes.size!==1){plan.skipped.push(codes.size?'name_match_multiple':'name_match_none');continue;}
   const row=[...codes.values()][0];
   const ticker=`${row.stockCode}.HK`;
   const u=input.universe.get(ticker);
   if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
   const owner=input.openOwner.get(ticker);
   if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
   const l=listing(u,input.asOf);
   const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
   plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
    schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
    evidence,sources:[evidence],...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   }});
  }
 }
 plan.skipped.sort();
 return plan;
}

/** Re-reads the ticker's rows after attachSecurity reported a conflict and names the actual cause. */
async function conflictCause(tables:TableClient,a:IssuerSecurityInput):Promise<{reasonCode:string;detail:Record<string,unknown>}>{
 const rows=await tables.select('issuer_securities',{ticker:a.ticker},{orderBy:'valid_from'});
 const to=a.valid_to??null;
 const overlap=rows.filter(r=>(to===null||String(r.valid_from)<to)&&(r.valid_to==null||a.valid_from<String(r.valid_to)));
 const other=overlap.find(r=>r.issuer_id!==a.issuer_id);
 if(other)return {reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',owner_issuer_id:String(other.issuer_id),owner_valid_from:String(other.valid_from),owner_valid_to:other.valid_to==null?null:String(other.valid_to)}};
 const own=rows.filter(r=>r.issuer_id===a.issuer_id&&(overlap.includes(r)||String(r.valid_from)===a.valid_from));
 if(own.length)return {reasonCode:'window_conflict',detail:{reason:'window_overlaps_own_row',rows:own.map(r=>({valid_from:String(r.valid_from),valid_to:r.valid_to==null?null:String(r.valid_to),isin:r.isin==null?null:String(r.isin)}))}};
 const holders=a.isin?(await tables.select('issuer_securities',{isin:a.isin},{orderBy:'valid_from'})).filter(r=>r.ticker!==a.ticker):[];
 return {reasonCode:'identifier_conflict',detail:{reason:'isin_held_by_other_row',isin:a.isin??null,holders:holders.map(r=>({issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from)}))}};
}

export async function applyAhLinks(tables:TableClient,plan:AhLinkPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult&{claims:Record<string,number>}>{
 const counts=emptyCounts();const errors:BatchError[]=[];const claims:Record<string,number>={};
 const park=(reasonCode:string,naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode,detail,payload,batchId:opts.batchId},counts,errors,{code:reasonCode,key:naturalKey});
 for(const e of plan.figiErrors){
  counts.failed++;
  errors.push({code:'openfigi_error',key:e.isin,message:JSON.stringify({lei:e.lei,message:e.message,request_sha256:e.evidence.request_sha256,response_sha256:e.evidence.response_sha256,index:e.evidence.index})});
 }
 for(const a of plan.attaches){
  try{
   const res=await attachSecurity(tables,a);
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else{
    const cause=await conflictCause(tables,a);
    await park(cause.reasonCode,`${a.ticker}:${a.valid_from}`,{...(plan.attachEvidence[`${a.issuer_id}|${a.ticker}`]??{}),rule:'same_lei',...cause.detail},
     {issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
   }
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:a.ticker,message:errorMessage(e)});}
 }
 for(const x of plan.conflicts)await park('ownership_conflict',x.naturalKey,x.detail,x.payload);
 for(const c of plan.claims){
  try{const created=await fileClaim(tables,c);const k=created?c.op:`${c.op}_appended`;claims[k]=(claims[k]??0)+1;}
  catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.value}`,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
}
