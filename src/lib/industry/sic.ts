// src/lib/industry/sic.ts
// SEC SIC classification and memberships (spec §4.1, §4.2, §4.4 SIC; no history → never aggregated).
//  - runClassificationsSic: SIC code list page → industry_classifications (scheme 'sic', version 'sec-current',
//    flat: level SIC_LEVEL = 1, parent null, name_en = Industry Title, attributes {office}); only-add, a renamed
//    code is quarantined classification_name_conflict.
//  - syncSicScope: the US facts scope (FactsDb.scopeAll('US'), priority > 0) → industry_sync_scope rows (job 'sic');
//    new issuers are INSERTED due now (a conflicting concurrent insert is ignored — an existing row and its lease are
//    never overwritten); rows of issuers that left the scope are retired (next_due_at = RETIRED_DUE, compare-and-swap,
//    never while leased) and re-activated when they come back, so they can never fill the due window (Codex plan
//    audit round 1 #7).
//  - runMembershipsSic: due scope rows, paged until `limit` ELIGIBLE rows (active, lease free) are found; each claimed by
//    compare-and-swap on (updated_at, lease_batch_id) (claimSicScopeRow: exactly one concurrent worker wins) and completed fenced by
//    lease_batch_id (finishSicScopeRow: a worker whose lease was taken over cannot clear it — lease_lost; Codex plan
//    audit round 1 #6); paced ≤ 10 req/s → submissions `sic` → IndustryDb.applySicMembership
//    (rpc apply_sic_memberships: same code → duplicate; another code → old row closed at the observation date and a new
//    one opened; a second change on the same day → same_day_change). valid_from = available_date = observation date;
//    provenance {availability:'observed', raw_hash, locator}. fiscalYearEnd (+ sic, sicDescription) is added to
//    issuers.provenance.sec_submissions (optimistic, guarded by updated_at; rewritten only when a value changed).
//    Skips (informational): no_cik, no_submissions (404), no_sic; sec_unavailable (429/5xx/network) is an error entry
//    (batch partial, retried next day); quarantined: unknown_sic_code (code not in the classification table), same_day_change. Batch dataset industry.sic.memberships,
//    freshness cadence weekly (cron 0 2 * * 0).
import type {Row,TableClient} from '../db/table-client';
import {TableError,selectAll} from '../db/table-client';
import type {BatchError,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {errorMessage,loaderOutcome,parkConflict,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import type {RunResult} from './classifications';
import type {ClassificationRow,IndustryDeps} from './types';
import {IndustryDbError} from './types';
import type {SicCodeRow} from './providers/sec-sic';
import {fetchSicCodeTable,fetchSubmissionsSic,normalizeCik10} from './providers/sec-sic';

export const SIC_LEVEL=1;
export const SIC_VERSION='sec-current';
export const SIC_CLASSIFY_DATASET='industry.sic.classifications';
export const SIC_DATASET='industry.sic.memberships';
export const SIC_SOURCE='sec:submissions';
export const SEC_MIN_INTERVAL_MS=150;
const DAY=86_400_000;
const RETRY_UNAVAILABLE_MS=DAY,NEXT_RUN_MS=7*DAY,LEASE_MS=15*60_000,DUE_PAGE=500;
const iso=(ms:number)=>new Date(ms).toISOString();
/** next_due_at of a retired scope row (issuer left the US facts scope): never due. */
export const RETIRED_DUE='9999-12-31T00:00:00.000Z';
const ms=(v:unknown)=>v==null?null:Date.parse(String(v));
const isRetired=(r:Row)=>ms(r.next_due_at)===Date.parse(RETIRED_DUE);
const leaseFree=(r:Row,now:Date)=>{const l=ms(r.lease_until);return l===null||l<now.getTime();};

/** Atomic claim of one scope row: compare-and-swap on (updated_at, lease_batch_id) as read, so of two workers that read the same row exactly one wins (the winner's lease_batch_id is new, even when both clocks agree). */
export async function claimSicScopeRow(tables:TableClient,row:Row,batchId:string,now:Date):Promise<boolean>{
 if(!leaseFree(row,now)||row.updated_at==null)return false;
 return (await tables.update('industry_sync_scope',{issuer_id:String(row.issuer_id),job:'sic',updated_at:row.updated_at as string,lease_batch_id:(row.lease_batch_id as string|null)??null},
  {lease_until:iso(now.getTime()+LEASE_MS),lease_batch_id:batchId,updated_at:now.toISOString()}))===1;
}
/** Completion fenced by the lease: only the batch that holds the lease can write the outcome and release it. */
export async function finishSicScopeRow(tables:TableClient,issuerId:string,batchId:string,patch:Row):Promise<boolean>{
 return (await tables.update('industry_sync_scope',{issuer_id:issuerId,job:'sic',lease_batch_id:batchId},{...patch,lease_until:null,lease_batch_id:null}))===1;
}

export function planSicClassifications(rows:SicCodeRow[]):ClassificationRow[]{
 return rows.map(r=>({scheme:'sic',version:SIC_VERSION,code:r.code,level:SIC_LEVEL,name_zh:null,name_en:r.title,parent_code:null,attributes:{office:r.office}}));
}

export async function runClassificationsSic(deps:IndustryDeps,opts:{triggeredBy?:TriggeredBy;userAgent?:string}={}):Promise<RunResult>{
 if(!deps.codeVersion)throw new Error('code_version_missing');
 const {batchId}=await startBatch(deps.tables,{producer:'industry-sic-classify',dataset:SIC_CLASSIFY_DATASET,codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'});
 const counts=emptyCounts();const errors:BatchError[]=[];let rejected:Record<string,number>={};
 try{
  const page=await fetchSicCodeTable({fetch:deps.fetch,userAgent:opts.userAgent,now:deps.now});
  if(page.kind!=='ok')errors.push({code:'sec_unavailable',message:`status_${page.status??'network'}`});
  else{
   counts.fetched=page.rows.length+page.rejected.length;
   rejected=summarizeSkips(page.rejected.map(r=>`rejected_${r.split('_')[0]}`));
   const res=await deps.db.upsertClassifications(batchId,planSicClassifications(page.rows));
   counts.inserted=res.inserted;counts.duplicates=res.unchanged;
   for(const c of res.conflicts)
    await parkConflict(deps.tables,{dataset:SIC_CLASSIFY_DATASET,table:'industry_classifications',naturalKey:`sic:${SIC_VERSION}:${c.code}`,reasonCode:'classification_name_conflict',detail:{incoming:{name_en:c.name_en}},payload:{...c,raw_hash:page.rawHash},batchId},counts,errors,{code:'classification_name_conflict',key:c.code});
  }
 }catch(e){errors.push({code:'sic_table_error',message:errorMessage(e)});}
 const all=withSkippedSummary(errors,{},rejected);
 const status=await finishBatch(deps.tables,batchId,{counts,errors:all},deps.now());
 const outcome=loaderOutcome(status,counts,rejected);
 await recordAttempt(deps.tables,SIC_CLASSIFY_DATASET,{ok:outcome.ok,cadence:'weekly',now:deps.now()});
 return {status,batchId,counts,errors:all,exitCode:outcome.exitCode};
}

/** Active US facts scope → industry_sync_scope (job 'sic'): insert new (never overwrite), retire departed, re-activate returning. */
export async function syncSicScope(deps:Pick<IndustryDeps,'tables'|'facts'|'now'>):Promise<{added:number;retired:number;reactivated:number;active:Set<string>}>{
 const active=new Set((await deps.facts.scopeAll('US')).filter(r=>Number(r.priority)>0).map(r=>String(r.issuer_id)));
 const have=new Map((await selectAll(deps.tables,'industry_sync_scope',{job:'sic'},'issuer_id')).map(r=>[String(r.issuer_id),r]));
 const at=deps.now();const now=at.toISOString();let added=0,retired=0,reactivated=0;
 for(const id of [...active].sort()){
  const r=have.get(id);
  if(!r){
   try{await deps.tables.insert('industry_sync_scope',{issuer_id:id,job:'sic',next_due_at:now,lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:now});added++;}
   catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}   // a concurrent worker inserted it: keep its row and lease
   continue;
  }
  if(isRetired(r)&&await deps.tables.update('industry_sync_scope',{issuer_id:id,job:'sic',updated_at:r.updated_at as string},{next_due_at:now,updated_at:now})===1)reactivated++;
 }
 for(const [id,r] of have){
  if(active.has(id)||isRetired(r)||!leaseFree(r,at))continue;
  if(await deps.tables.update('industry_sync_scope',{issuer_id:id,job:'sic',updated_at:r.updated_at as string},{next_due_at:RETIRED_DUE,updated_at:now})===1)retired++;
 }
 return {added,retired,reactivated,active};
}

const provOf=(row:Row)=>(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;

export interface RunMembershipsSicOptions{limit?:number;triggeredBy?:TriggeredBy;userAgent?:string;sleep?:(ms:number)=>Promise<void>}
export interface RunMembershipsSicResult extends RunResult{processed:number;added:number;retired:number}

export async function runMembershipsSic(deps:IndustryDeps,opts:RunMembershipsSicOptions={}):Promise<RunMembershipsSicResult>{
 if(!deps.codeVersion)throw new Error('code_version_missing');
 const wait=opts.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const limit=opts.limit??200;
 const {added,retired,active}=await syncSicScope(deps);
 const known=new Set((await deps.db.classificationTree('sic',SIC_VERSION)).map(n=>n.code));
 const {batchId}=await startBatch(deps.tables,{producer:'industry-sic',dataset:SIC_DATASET,codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'});
 const counts=emptyCounts();const errors:BatchError[]=[];const skips:string[]=[];
 if(known.size===0)errors.push({code:'no_classifications',message:'run sic classifications first'});
 const start=deps.now();
 // eligibility (in scope, lease free) is applied while paging, so ineligible due rows can never fill the window (#7)
 const due:Row[]=[];const seen=new Set<string>();
 // deterministic order (next_due_at, issuer_id: the TableClient orders by one column, so rows are sorted per
 // complete read); the offset advances by the rows actually returned and the read stops only on an empty page
 // (a server cap below DUE_PAGE must not end it early)
 if(known.size>0){
  const all:Row[]=[];
  for(let offset=0;;){
   const page=await deps.tables.select('industry_sync_scope',{job:'sic'},{lt:{next_due_at:iso(start.getTime()+1)},orderBy:'issuer_id',limit:DUE_PAGE,offset});
   if(page.length===0)break;
   all.push(...page);offset+=page.length;
  }
  all.sort((a,b)=>{const x=String(a.next_due_at),y=String(b.next_due_at);return x<y?-1:x>y?1:String(a.issuer_id)<String(b.issuer_id)?-1:1;});
  for(const r of all){const id=String(r.issuer_id);if(due.length<limit&&!seen.has(id)&&active.has(id)&&leaseFree(r,start)){seen.add(id);due.push(r);}}
 }
 let processed=0;
 for(const s of due){
  const issuerId=String(s.issuer_id);
  if(!await claimSicScopeRow(deps.tables,s,batchId,deps.now()))continue;   // another worker won the row
  if(processed>0)await wait(SEC_MIN_INTERVAL_MS);
  processed++;
  let ok=false;let retryMs=NEXT_RUN_MS;
  try{
   const [issuer]=await deps.tables.select('issuers',{issuer_id:issuerId},{limit:1});
   const cik=issuer&&typeof issuer.cik==='string'?issuer.cik:null;
   if(!issuer||!cik){skips.push('no_cik');}
   else{
    const sub=await fetchSubmissionsSic(cik,{fetch:deps.fetch,userAgent:opts.userAgent,now:deps.now});
    if(sub.kind==='not_found')skips.push('no_submissions');
    else if(sub.kind==='unavailable'){counts.fetched++;errors.push({code:'sec_unavailable',key:issuerId,message:`status_${sub.status??'network'}`});retryMs=RETRY_UNAVAILABLE_MS;}
    else{
     const p=sub.parsed;
     // availability is the day the successful response arrived, not the request start (a request may cross UTC midnight)
     const observed=sub.fetchedAt.slice(0,10);
     let sameCik=false;
     try{sameCik=normalizeCik10(p.cik)===normalizeCik10(cik);}catch{sameCik=false;}
     if(!sameCik){
      await quarantine(deps.tables,{dataset:SIC_DATASET,table:'issuer_industry_memberships',naturalKey:`sic:${issuerId}:cik_mismatch`,reasonCode:'cik_mismatch',detail:{requested_cik:cik,response_cik:p.cik},payload:{issuer_id:issuerId,raw_hash:sub.rawHash,url:sub.url},batchId});
      counts.fetched++;counts.quarantined++;errors.push({code:'cik_mismatch',key:issuerId,message:`${cik}!=${p.cik}`});
     }else{
     // skip-only responses (empty SIC) have no outcome row: they are not counted as fetched (batch contract: fetched>0 needs an outcome)
     if(p.sic)counts.fetched++;
     // issuers.provenance.sec_submissions (only when a value changed) — written by applySicMembership inside its
     // lease-fenced transaction, never directly (Codex plan audit round 2 R2-3)
     const prov=provOf(issuer);const prev=(prov.sec_submissions??{}) as Record<string,unknown>;
     const secSubmissions=prev.fiscal_year_end!==p.fiscalYearEnd||prev.sic!==p.sicRaw||prev.sic_description!==p.sicDescription
      ?{source:SIC_SOURCE,url:sub.url,observed_at:sub.fetchedAt,raw_hash:sub.rawHash,fiscal_year_end:p.fiscalYearEnd,sic:p.sicRaw,sic_description:p.sicDescription}:null;
     const fence={leaseBatch:batchId,secSubmissions};
     if(!p.sic||!known.has(p.sic))await deps.db.applySicMembership(batchId,issuerId,observed,null,{},fence);   // provenance only (throws lease_lost)
     if(!p.sic){skips.push('no_sic');ok=true;}
     else if(!known.has(p.sic)){
      await quarantine(deps.tables,{dataset:SIC_DATASET,table:'issuer_industry_memberships',naturalKey:`sic:${issuerId}:${p.sic}`,reasonCode:'unknown_sic_code',detail:{sic:p.sic,sic_description:p.sicDescription},payload:{issuer_id:issuerId,cik,raw_hash:sub.rawHash,url:sub.url},batchId});
      counts.quarantined++;errors.push({code:'unknown_sic_code',key:issuerId,message:p.sic});
     }else{
      try{
       const res=await deps.db.applySicMembership(batchId,issuerId,observed,p.sic,{availability:'observed',raw_hash:sub.rawHash,locator:{url:sub.url,field:'sic',cik},sic_description:p.sicDescription},fence);
       if(res==='inserted')counts.inserted++;else if(res==='duplicate')counts.duplicates++;else if(res==='changed')counts.versioned++;
       ok=true;
      }catch(e){
       if(!(e instanceof IndustryDbError)||e.code==='lease_lost')throw e;
       await quarantine(deps.tables,{dataset:SIC_DATASET,table:'issuer_industry_memberships',naturalKey:`sic:${issuerId}:${observed}`,reasonCode:e.code==='unknown'?'sic_apply_error':e.code,detail:{sic:p.sic,message:errorMessage(e).slice(0,500)},payload:{issuer_id:issuerId,cik,raw_hash:sub.rawHash},batchId});
       counts.quarantined++;errors.push({code:e.code,key:issuerId});
      }
     }
     }   // sameCik
    }
   }
  }catch(e){
   // lease_lost: another worker holds the row now — nothing was written by this worker, its outcome stands; no finish
   if(e instanceof IndustryDbError&&e.code==='lease_lost'){errors.push({code:'lease_lost',key:issuerId});continue;}
   counts.failed++;errors.push({code:'sic_error',key:issuerId,message:errorMessage(e)});
  }
  const doneAt=deps.now().toISOString();
  if(!await finishSicScopeRow(deps.tables,issuerId,batchId,{next_due_at:iso(deps.now().getTime()+retryMs),last_attempt_at:doneAt,...(ok?{last_success_at:doneAt}:{}),last_status:ok?'success':'failed',updated_at:doneAt}))
   errors.push({code:'lease_lost',key:issuerId});   // the lease expired and another worker took the row: its outcome stands
 }
 const skippedSummary=summarizeSkips(skips);
 const all=withSkippedSummary(errors,skippedSummary);
 const status=await finishBatch(deps.tables,batchId,{counts,errors:all},deps.now());
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(deps.tables,SIC_DATASET,{ok:outcome.ok,cadence:'weekly',now:deps.now(),detail:{processed,added,retired}});
 return {status,batchId,counts,errors:all,exitCode:outcome.exitCode,processed,added,retired};
}
