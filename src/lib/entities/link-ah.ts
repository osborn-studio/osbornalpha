// src/lib/entities/link-ah.ts
// A+H linking (spec §4.2.2). Rule 1 (automatic, hard_identifier): an issuer's LEI → GLEIF ISINs →
// OpenFIGI HK line that is in stocks_universe and held by nobody → attachSecurity at the listing
// date (listing_date) or the run date (first_observed); held by another issuer → ownership_conflict.
// Rule 2 (claims only, name_match): an issuer holding A-share rows, no H row and a name, whose
// normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
// only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
// waits for a confirmed source (spec §14-1).
// OpenFIGI hints are never trusted on their own: one ISIN can map to several tickers (Tencent:
// 00700.HK, 80700.HK, TCTZF), so a returned HK ticker is attached automatically only when it is
// validated as this issuer's own line — HKEX stock code + ISIN match, or (when HKEX has no ISIN for
// the code) a ticker-level FIGI equal to the ISIN-level FIGI. Anything else is skipped, not claimed.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {fileClaim,type ClaimInput} from './claims';
import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
import {groupFigiResults,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
import {rawPath} from '../dq/raw-store';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';
import {attachSecurity} from './securities';
import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';

/** HKEX list Category value for ordinary equity, compared lower-cased (Task 3a verification). */
export const HKEX_EQUITY_CATEGORY='equity';
export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;responseSha256:string;index:number;lei:string}
export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
export interface AhLinkInput{
 asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
 universe:ReadonlyMap<string,UniverseListing>;
 /** ticker → issuer_id of its open row */
 openOwner:ReadonlyMap<string,string>;
 hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
 /** 5-digit stock code → ISIN (mergeHkexIsins); validation source #1 for rule 1 */
 hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
 /** HK ticker → FIGI from a ticker-level OpenFIGI lookup; validation source #2 when HKEX has no ISIN for the code */
 tickerFigi?:ReadonlyMap<string,string>;
 /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
 raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
}
export interface AhLinkPlan{attaches:IssuerSecurityInput[];conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[]}

type Validated='hkex_isin'|'ticker_figi';
/** Is this OpenFIGI-returned HK ticker verifiably the issuer's own line? Otherwise the skip reason. */
function validateHit(h:AhFigiHit,input:AhLinkInput):{ok:true;by:Validated;locator:string}|{ok:false;reason:string}{
 const code=h.ticker.slice(0,5);
 const row=input.hkex?.rows.find(r=>r.stockCode===code&&!SUPERSEDED.test((r.name??'').trim()));
 if(row&&row.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY)return {ok:false,reason:'not_equity'};
 const k=input.hkexIsins?.get(code);
 if(k)return k.isin===h.isin?{ok:true,by:'hkex_isin',locator:`hkex:${k.file}:${k.sha256}:row:${k.row}`}:{ok:false,reason:'hkex_isin_mismatch'};
 const tf=input.tickerFigi?.get(h.ticker);
 if(tf&&h.figi&&tf===h.figi)return {ok:true,by:'ticker_figi',locator:`openfigi_ticker:${tf}`};
 return {ok:false,reason:'ticker_unvalidated'};
}
const SUPERSEDED=/-\s*old$/i;
export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';

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
    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
   }
  }
 }
 return out;
}

function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
 if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
 return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
}
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};

export function planAhLinks(input:AhLinkInput):AhLinkPlan{
 const plan:AhLinkPlan={attaches:[],conflicts:[],claims:[],skipped:[]};
 const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
 const linked=new Set<string>();const seen=new Set<string>();
 for(const h of input.figiHits){
  const i=byId.get(h.issuer_id);
  if(!i)continue;
  if(i.hTickers.length){plan.skipped.push('already_has_h');continue;}
  const k=`${h.issuer_id}|${h.ticker}`;
  if(seen.has(k))continue;
  seen.add(k);
  const u=input.universe.get(h.ticker);
  if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
  const v=validateHit(h,input);
  if(!v.ok){plan.skipped.push(v.reason);continue;}
  const owner=input.openOwner.get(h.ticker);
  if(owner===h.issuer_id){plan.skipped.push('already_attached');linked.add(h.issuer_id);continue;}
  if(owner!==undefined){
   const g=input.raw?.gleif,hk=input.raw?.hkex;
   plan.conflicts.push({naturalKey:`${h.ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,validated_by:v.by,
    evidence:{gleif_sha256:h.gleifSha256,...(g?{gleif_path:g.path}:{}),openfigi_response_sha256:h.responseSha256,openfigi_path:rawPath('openfigi',h.responseSha256,'json'),...(hk?{hkex_sha256:hk.sha256,hkex_path:hk.path}:{})}},
    payload:{issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin}});
   continue;
  }
  const l=listing(u,input.asOf);
  const provenance=sanitizeProvenance({
   isin:{source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index};${v.locator}`},
   ...(h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:h.responseSha256,job:jobOf(h.job),level:h.level}}:{}),
   ...l.prov,
  });
  plan.attaches.push({issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin,figi:h.figi,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
  linked.add(h.issuer_id);
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

export async function applyAhLinks(tables:TableClient,plan:AhLinkPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult&{claims:Record<string,number>}>{
 const counts=emptyCounts();const errors:BatchError[]=[];const claims:Record<string,number>={};
 const park=(naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode:'ownership_conflict',detail,payload,batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:naturalKey});
 for(const a of plan.attaches){
  try{
   const res=await attachSecurity(tables,a);
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else await park(`${a.ticker}:${a.valid_from}`,{reason:'ticker_owned_by_other_issuer',rule:'same_lei'},{issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:a.ticker,message:errorMessage(e)});}
 }
 for(const x of plan.conflicts)await park(x.naturalKey,x.detail,x.payload);
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
