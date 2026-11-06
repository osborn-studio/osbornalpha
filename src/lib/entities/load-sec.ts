// Load US issuers and their listed securities from SEC company_tickers_exchange.json.
// planSecLoad is pure. applySecLoad performs the public writes through a TableClient and returns
// receipt counts; the script owns the ingest batch, and every conflict is parked as a dq_quarantine
// row of that batch. SEC exchange membership does not establish
// domicile and the file carries no share class, so country_code is never set and share_class is
// always 'unknown'.
import {callRpc,selectAll,type Row,type TableClient} from '../db/table-client';
import {fileClaim} from './claims';
import {sanitizeProvenance} from './provenance';
import type {ClaimEvidence} from './types';
import type {BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {emptyCounts} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import type {QuarantineInput} from '../dq/quarantine';
import {quarantine} from '../dq/quarantine';
import {normalizeSecurityTicker} from '../securities/ticker';
import type {SecExchangeParse,SecExchangeRow} from '../research/entity-keys/parsers';
import {MAX_SEC_ROWS} from '../research/entity-keys/parsers';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';

export const SEC_SOURCE='sec_company_tickers_exchange';

type FieldProvenance={source:string;as_of:string};
export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{valid_from:{source:string;as_of:string;row:{exchange:string}}}}
export interface SecLoadPlan{asOf:string;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}

/**
 * The SEC ticker as written (upper-cased) wins over its normalized form, so `BRK.A` never
 * collapses to `BRK` through Wind-suffix stripping when the universe lists `BRK.A`.
 */
function universeTicker(raw:string,universe:ReadonlySet<string>):string|null{
 const exact=raw.trim().toUpperCase();
 if(universe.has(exact))return exact;
 const normalized=normalizeSecurityTicker(raw,'US');
 return normalized&&universe.has(normalized)?normalized:null;
}

/**
 * Keep rows whose ticker is in the US universe. One issuer per CIK (first row's name); the first
 * kept ticker of a CIK in file order is primary. `skipped` lists raw tickers not in the universe.
 * A ticker repeated across rows is kept each time so the writer reports it as duplicate/conflict.
 */
export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,asOf:string):SecLoadPlan{
 if(rows.length>MAX_SEC_ROWS)throw new Error('too_many_rows');
 const prov=():FieldProvenance=>({source:SEC_SOURCE,as_of:asOf});
 const issuers=new Map<string,PlannedIssuer>();
 const securities:PlannedSecurity[]=[];
 const skipped:string[]=[];
 for(const r of rows){
  const ticker=universeTicker(r.ticker,universe);
  if(!ticker){skipped.push(r.ticker);continue;}
  const first=!issuers.has(r.cik);
  if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
  // Public provenance keeps the whitelist (spec 3 §3.1): the exchange is a copied source-row value of valid_from.
  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{valid_from:{source:SEC_SOURCE,as_of:asOf,row:{exchange:r.exchange}}}});
 }
 return {asOf,issuers:[...issuers.values()],securities,skipped};
}

/** skippedSummary: expected filtering (informational); rejectedSummary: invalid input (degrades status). */
export interface ApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>}

export const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);

/** Count skip reasons by their code (the part before ':') so the summary stays short. */
export function summarizeSkips(reasons:Iterable<string>):Record<string,number>{
 const out:Record<string,number>={};
 for(const r of reasons){const code=r.split(':')[0];out[code]=(out[code]??0)+1;}
 return out;
}

/**
 * Skipped and rejected items cannot be counted in BatchCounts, so each kind surfaces as ONE leading
 * error entry: `skipped_summary` (informational) then `rejected_summary` (not informational, so
 * the batch becomes partial or failed).
 */
export function withSkippedSummary(errors:BatchError[],summary:Record<string,number>,rejected:Record<string,number>={}):BatchError[]{
 const lead:BatchError[]=[];
 if(Object.keys(summary).length)lead.push({code:'skipped_summary',message:JSON.stringify(summary)});
 if(Object.keys(rejected).length)lead.push({code:'rejected_summary',message:JSON.stringify(rejected)});
 return [...lead,...errors];
}

/**
 * Shared status/exit/freshness policy for the entity loaders: exit 1 when the batch failed, any
 * row failed or any input row was rejected as invalid; the freshness attempt is ok only on
 * success, or on a partial run with no failures that actually landed rows (a run that only
 * quarantined is not ok).
 */
export function loaderOutcome(status:BatchStatus,counts:BatchCounts,rejected:Record<string,number>={}):{ok:boolean;exitCode:0|1}{
 const ok=status==='success'||(status==='partial'&&counts.failed===0&&counts.inserted+counts.duplicates>0);
 return {ok,exitCode:status==='failed'||counts.failed>0||Object.keys(rejected).length>0?1:0};
}

/**
 * Records a conflict: pushes `error`, then parks the row in dq_quarantine (deduped on the open
 * key). The row counts as quarantined only once the quarantine row is written; if that write
 * fails it counts as failed with an extra `quarantine_error`.
 */
export async function parkConflict(client:TableClient,input:QuarantineInput,counts:BatchCounts,errors:BatchError[],error:BatchError):Promise<void>{
 errors.push(error);
 try{await quarantine(client,input);counts.quarantined++;}
 catch(e){counts.failed++;errors.push({code:'quarantine_error',key:error.key,message:errorMessage(e)});}
}

/** Quarantine reason code for an issuer conflict: a match on a retired issuer is kept apart. */
export const issuerReasonCode=(reason:string|undefined)=>reason==='inactive_issuer'?'inactive_issuer':'issuer_conflict';

export const SEC_DATASET=DATASETS.entities.sec;

export interface SecApplyOptions{asOf:string;batchId:string;batchProducerMeta:{sourceRows:number;rejected:SecExchangeParse['rejected']}}

/**
 * Writes the plan to the public issuer master. `fetched` is the number of SEC data rows; each
 * issuer and security write has one outcome; securities whose issuer failed or was quarantined
 * count as failed (`blocked_by_issuer`). Issuer conflicts (key: cik) and ownership conflicts (key:
 * `ticker:valid_from`) are quarantined under `opts.batchId` with the rejected input as payload.
 * Not-in-universe rows go to skippedSummary; producer rejects (`rejected_*`) to rejectedSummary.
 */
export async function applySecLoad(client:TableClient,plan:SecLoadPlan,opts:SecApplyOptions):Promise<ApplyResult>{
 if(plan.asOf!==opts.asOf)throw new Error('as_of_mismatch');
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 counts.fetched=opts.batchProducerMeta.sourceRows;
 const skippedSummary=summarizeSkips(plan.skipped.map(()=>'not_in_universe'));
 const rejectedSummary=summarizeSkips(opts.batchProducerMeta.rejected.map(r=>`rejected_${r.reason}`));
 if(plan.issuers.length===0){
  errors.push({code:'empty_plan',message:'no SEC row matched the US universe'});
  return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
 }

 const issuerByCik=new Map<string,string>();
 for(const issuer of plan.issuers){
  try{
   const res=await upsertIssuerByIdentifiers(client,issuer);
   if(res.conflict||!res.issuer_id){
    await parkConflict(client,{dataset:SEC_DATASET,table:'issuers',naturalKey:issuer.cik,reasonCode:issuerReasonCode(res.reason),detail:{reason:res.reason??null},payload:{cik:issuer.cik,canonical_name_en:issuer.canonical_name_en},batchId:opts.batchId},counts,errors,{code:'issuer_conflict',key:issuer.cik,message:res.reason});
    continue;
   }
   issuerByCik.set(issuer.cik,res.issuer_id);
   if(res.created)counts.inserted++;else counts.duplicates++;
  }catch(e){counts.failed++;errors.push({code:'issuer_error',key:issuer.cik,message:errorMessage(e)});}
 }

 for(const sec of plan.securities){
  const issuer_id=issuerByCik.get(sec.cik);
  if(!issuer_id){counts.failed++;errors.push({code:'blocked_by_issuer',key:sec.ticker,message:sec.cik});continue;}
  const {cik:_cik,...rest}=sec;
  try{
   const res=await attachSecurity(client,{...rest,issuer_id});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${sec.ticker}:${sec.valid_from}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',cik:sec.cik},
    payload:{ticker:sec.ticker,isin:null,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:null,cik:sec.cik},batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:sec.ticker});
  }catch(e){
   counts.failed++;
   const msg=errorMessage(e);
   errors.push({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key:sec.ticker,message:msg});
  }
 }
 return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
}

// ---------------------------------------------------------------- ticker-change detection (spec 3 §4.3.4)

/** Previous successful snapshot, read from an entities.sec batch receipt (tool_versions). */
export interface SnapshotMeta{as_of:string;fetched_at:string|null;rows:number|null;sha256:string|null}
export type SnapshotCheck='ok'|'stale_snapshot'|'incomplete_snapshot';

export function snapshotMetaOf(batch:Row):SnapshotMeta|null{
 const tv=(batch.tool_versions&&typeof batch.tool_versions==='object'?batch.tool_versions:{}) as Record<string,unknown>;
 if(typeof tv.as_of!=='string')return null;
 const rows=typeof tv.rows==='string'&&/^\d+$/.test(tv.rows)?Number.parseInt(tv.rows,10):null;
 return {as_of:tv.as_of,fetched_at:typeof tv.fetched_at==='string'?tv.fetched_at:null,rows,sha256:typeof tv.sha256==='string'?tv.sha256:null};
}

/** as_of and fetched_at must not go backwards; a file below 90% of the previous data rows is refused. */
export function checkSnapshot(prev:SnapshotMeta|null,cur:{as_of:string;fetched_at:string;rows:number}):SnapshotCheck{
 if(!prev)return 'ok';
 if(cur.as_of<prev.as_of)return 'stale_snapshot';
 if(prev.fetched_at!==null&&Date.parse(cur.fetched_at)<Date.parse(prev.fetched_at))return 'stale_snapshot';
 if(prev.rows!==null&&cur.rows*10<prev.rows*9)return 'incomplete_snapshot';
 return 'ok';
}

/**
 * Tickers per CIK as the file lists them, in exact (upper-cased) and normalized form, so a stored
 * ticker matches either way; owners are indexed by the exact form only (normalization strips Wind
 * suffixes, BRK.A → BRK, which must not make another CIK look like the owner).
 */
export function fileTickerIndex(rows:readonly SecExchangeRow[]):{byCik:Map<string,Set<string>>;cikByTicker:Map<string,string>}{
 const byCik=new Map<string,Set<string>>(),cikByTicker=new Map<string,string>();
 for(const r of rows){
  const exact=r.ticker.trim().toUpperCase();
  const set=byCik.get(r.cik)??new Set<string>();
  set.add(exact);
  const n=normalizeSecurityTicker(r.ticker,'US');if(n)set.add(n);
  byCik.set(r.cik,set);
  if(!cikByTicker.has(exact))cikByTicker.set(exact,r.cik);
 }
 return {byCik,cikByTicker};
}

export const CLOSE_MIN_DAYS=7;
const DAY_MS=86_400_000;
export interface TickerChangeInput{rows:readonly SecExchangeRow[];asOf:string;fetchedAt:string;fileSha256:string;batchId:string}
export interface TickerChangeDeps{
 /** submissions tickers[] for a CIK fetched in this run (the second source); null = SEC unavailable */
 confirm:(cik:string)=>Promise<{tickers:string[];sha256:string}|null>;
 /** as_of of the latest successful entities.sec batch strictly before `before`, or null */
 lastSeenAsOf:(before:string)=>Promise<string|null>;
}
export interface TickerChangeResult extends ApplyResult{pending:number;cleared:number;closed:number;claims:number}
interface PendingChange{first_missing_as_of:string;first_missing_sha256:string;first_missing_fetched_at:string;replacement_tickers:string[];sources:string[]}

const patchProvenance=async(client:TableClient,issuer:string,ticker:string,validFrom:string,set:Record<string,unknown>,remove:string[])=>
 callRpc(client,'patch_security_provenance',{p_issuer:issuer,p_ticker:ticker,p_valid_from:validFrom,p_set:set,p_remove:remove});
const pendingOf=(v:unknown):PendingChange|null=>{
 const o=(v&&typeof v==='object'?v:null) as Partial<PendingChange>|null;
 if(!o||typeof o.first_missing_as_of!=='string'||typeof o.first_missing_sha256!=='string'||typeof o.first_missing_fetched_at!=='string')return null;
 return {first_missing_as_of:o.first_missing_as_of,first_missing_sha256:o.first_missing_sha256,first_missing_fetched_at:o.first_missing_fetched_at,
  replacement_tickers:Array.isArray(o.replacement_tickers)?o.replacement_tickers.map(String):[],sources:Array.isArray(o.sources)?o.sources.map(String):[]};
};

/**
 * Runs after applySecLoad on the same file. For every open row with source SEC_SOURCE whose ticker
 * the file no longer lists for the issuer's CIK: first miss → provenance.pending_change; reappearance
 * → pending_change removed; close only when still missing, ≥ CLOSE_MIN_DAYS since the first miss
 * (fetched_at), a different file hash, and the CIK's submissions tickers[] no longer list it. The
 * close is an OBSERVATION bound (valid_to = first_missing_as_of, method sec_file_absent), never a
 * ticker-change effective date: that only comes from a reviewed claim (evidence_only filed here).
 */
export async function detectTickerChanges(client:TableClient,input:TickerChangeInput,deps:TickerChangeDeps):Promise<TickerChangeResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];const skipped:string[]=[];
 let pending=0,cleared=0,closed=0,claims=0;
 const {byCik,cikByTicker}=fileTickerIndex(input.rows);
 const open=await selectAll(client,'issuer_securities',{valid_to:null,source:SEC_SOURCE},'ticker');
 const cikCache=new Map<string,string|null>();
 const cikOf=async(issuerId:string)=>{
  if(!cikCache.has(issuerId)){const [i]=await client.select('issuers',{issuer_id:issuerId},{limit:1});cikCache.set(issuerId,i&&i.status==='active'&&typeof i.cik==='string'?i.cik:null);}
  return cikCache.get(issuerId)!;
 };
 const confirmCache=new Map<string,{tickers:string[];sha256:string}|null>();
 const confirmOf=async(cik:string)=>{if(!confirmCache.has(cik))confirmCache.set(cik,await deps.confirm(cik));return confirmCache.get(cik)!;};
 for(const row of open){
  const ticker=String(row.ticker),issuerId=String(row.issuer_id),validFrom=String(row.valid_from);
  const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
  const pc=pendingOf(prov.pending_change);
  const changed=()=>{counts.failed++;errors.push({code:'row_changed',key:`${ticker}:${validFrom}`});};
  try{
   const cik=await cikOf(issuerId);
   if(!cik){skipped.push('no_cik');continue;}
   if(byCik.get(cik)?.has(ticker)){
    if(prov.pending_change!==undefined){
     const out=await patchProvenance(client,issuerId,ticker,validFrom,{},['pending_change']);
     if(out==='written'){counts.versioned++;cleared++;}else if(out==='not_found')changed();
    }
    continue;
   }
   const other=cikByTicker.get(ticker);
   if(other!==undefined&&other!==cik){
    await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${ticker}:${validFrom}`,reasonCode:'ownership_conflict',
     detail:{reason:'ticker_listed_under_other_cik',cik:other,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:other},batchId:input.batchId},
     counts,errors,{code:'ownership_conflict',key:ticker});
    continue;
   }
   if(!pc){
    const replacement=open.filter(o=>String(o.issuer_id)===issuerId&&String(o.valid_from)===input.asOf&&String(o.ticker)!==ticker).map(o=>String(o.ticker)).sort();
    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE]}});
    const out=await patchProvenance(client,issuerId,ticker,validFrom,set,[]);
    if(out==='written'){counts.versioned++;pending++;}else if(out==='not_found')changed();
    continue;
   }
   if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
   const conf=await confirmOf(cik);
   if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
   if(conf.tickers.map(t=>t.trim().toUpperCase()).includes(ticker)){skipped.push('close_unconfirmed');continue;}
   if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
   const lastSeen=await deps.lastSeenAsOf(pc.first_missing_as_of);
   const provenance=sanitizeProvenance({valid_to:{source:SEC_SOURCE,as_of:input.asOf,first_missing_as_of:pc.first_missing_as_of,first_missing_sha256:pc.first_missing_sha256,
    closing_sha256:input.fileSha256,submissions_sha256:conf.sha256,last_seen_as_of:lastSeen}});
   // atomic close: set_security_window merges only valid_to, so pending_change stays on the closed row
   const closeOut=await callRpc(client,'set_security_window',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_side:'to',p_new_date:pc.first_missing_as_of,p_provenance:provenance,p_to_method:'sec_file_absent'});
   if(closeOut!=='written'&&closeOut!=='duplicate'){changed();continue;}
   counts.versioned++;closed++;
   const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:input.asOf,evidence_sha256:input.fileSha256,locator:`cik:${cik}`};
   const note=`观测到 ${ticker} 消失、${pc.replacement_tickers.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
   if(await fileClaim(client,{issuer_id:issuerId,id_type:'ticker',value:ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
    schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:issuerId},
    params:{suggested_op:'backdate_window',old_ticker:ticker,replacement_tickers:pc.replacement_tickers,first_missing_as_of:pc.first_missing_as_of,submissions_sha256:conf.sha256,note},
    evidence,sources:[evidence],
   }}))claims++;
  }catch(e){counts.failed++;errors.push({code:'ticker_change_error',key:ticker,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary=summarizeSkips(skipped);
 const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},pending,cleared,closed,claims};
}
