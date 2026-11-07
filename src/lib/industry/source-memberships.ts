// src/lib/industry/source-memberships.ts
// SW2021 source records (spec §4.4): immutable import evidence in industry_source_memberships, separate from
// resolved memberships. Two passes per L1 (is_new 'Y' current, 'N' historical), has_more paging, one raw_hash
// per page and a row locator per record. Record key (scheme, version, source, ts_code, l3_code, in_date);
// content = name, l1_code, l2_code, out_date (raw_hash / locator / observed_at are evidence, not content).
// planSourceMemberships (pure): normalizes dates, rejects malformed rows (rejected_summary), de-duplicates the
// same key across the WHOLE fetch (all L1 pages; identical content → one input), parks a key seen with DIFFERENT content as
// `source_membership_ambiguous` (nothing written; one quarantine item per row, every variant in the payload; a non-info batch
// error, so the batch is partial and freshness is not advanced), and classifies each input against ALL current records looked up
// by natural key (an L1 correction keeps its source key): new key / unchanged / out_date null→date / other change.
// Spec 7th draft K3: member codes go through SW2021_CODE_ALIASES; every code must exist in the classification tree AT ITS LEVEL
// and l2.parent = l1, l3.parent = l2, else the row is quarantined classification_code_unknown / classification_hierarchy_mismatch
// (not written); out_date is inclusive, so only out_date < in_date is rejected. Cross-L1 continuity (K3): after all 31 L1 x {Y, N}
// passes, findSourceOverlaps reports a ts_code whose windows [in_date, out_date + 1) overlap under different l3 codes
// (quarantine source_membership_overlap + error; writes are not blocked).
// runMembershipsSw writes through IndustryDb.upsertSourceMemberships (rpc upsert_industry_source_memberships;
// the SQL decides duplicates/supersession and returns `changed`); every change that is not null→date is
// quarantined `source_membership_changed` (payload natural key + old + new content) and makes the batch partial.
// Batch lifecycle: every read/quarantine/write after startBatch sits under a handler (db_error / quarantine_error /
// upsert_error / fetch_error) that records the error and continues; finishBatch and recordAttempt are always reached.
// The resolver (resolve-memberships.ts) runs after this as its own step.
import type {BatchError,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {errorMessage,loaderOutcome,parkConflict,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import {createHash} from 'node:crypto';
import type {IndustryDeps,SourceMembershipInput,SourceMembershipRow} from './types';
import type {IndexMemberRow,RowLocator,SnapshotCapture,TusharePage} from './providers/tushare-industry';
import {IndustryProviderError,defaultTushareCall,fetchIndexMembers,locatorOf,ymdToIso} from './providers/tushare-industry';
import type {RunResult} from './classifications';
import {canonicalSwCode} from './sw2021';

export const SW_MEMBER_SOURCE='tushare:index_member_all';
export const SW_SOURCE_DATASET='industry.sw2021.source';
export const SW_SOURCE_PRODUCER='industry-sw-members';

export interface FetchedMember extends IndexMemberRow{raw_hash:string;locator:RowLocator;fetched_at:string}
type KeyFields=Pick<SourceMembershipInput,'source'|'ts_code'|'l3_code'|'in_date'>;
type ContentFields=Pick<SourceMembershipInput,'name'|'l1_code'|'l2_code'|'out_date'>;
export const sourceKey=(r:KeyFields)=>['sw2021','2021',r.source,r.ts_code,r.l3_code,r.in_date].join(':');
export const sameContent=(a:ContentFields,b:ContentFields)=>a.name===b.name&&a.l1_code===b.l1_code&&a.l2_code===b.l2_code&&a.out_date===b.out_date;
/** True when b differs from a only by out_date going from null to a date. */
export const isNullToDate=(a:ContentFields,b:ContentFields)=>a.out_date===null&&b.out_date!==null&&sameContent({...a,out_date:b.out_date},b);

export interface SourceChange{key:string;old:SourceMembershipRow;next:SourceMembershipInput;nullToDate:boolean}
/** code → level and parent of the classification tree (levels 1–3); a plain Set checks existence only. */
export type KnownTree=ReadonlyMap<string,{level:number;parent_code:string|null}>;
export interface SourcePlan{
 inputs:SourceMembershipInput[];duplicatesInFetch:number;ambiguous:{key:string;rows:SourceMembershipInput[]}[];rejected:string[];
 /** member rows whose (aliased) L1/L2/L3 codes are not in the tree at their level (classification_code_unknown) or whose triple is not one ancestry (classification_hierarchy_mismatch); not written */
 unknownCodes:{tag:string;codes:string[];row:SourceMembershipInput;reason:'classification_code_unknown'|'classification_hierarchy_mismatch'}[];
 expected:{newKeys:number;unchanged:number;nullToDate:number;changed:number};changes:SourceChange[];
}

/**
 * Pure. `rows` = every record of one fetch (both passes of ALL L1s covered, so natural keys are de-duplicated globally);
 * `current` = ALL current records (the L1 a record sits under may have changed: planning and change evidence look records up by
 * natural key); `known` = the classification tree (omitted → no code check). Member codes are mapped through
 * SW2021_CODE_ALIASES first (the original code is kept in locator.code_aliases). With a tree every code must exist at its
 * level (l1 ∈ level 1 …) and l2.parent = l1, l3.parent = l2.
 */
export function planSourceMemberships(rows:FetchedMember[],current:SourceMembershipRow[],known?:ReadonlySet<string>|KnownTree):SourcePlan{
 const plan:SourcePlan={inputs:[],duplicatesInFetch:0,ambiguous:[],rejected:[],unknownCodes:[],expected:{newKeys:0,unchanged:0,nullToDate:0,changed:0},changes:[]};
 const groups=new Map<string,SourceMembershipInput[]>();
 for(const r of rows){
  const ts=(r.ts_code??'').trim().toUpperCase();
  const tag=`${ts}:${r.l3_code??''}:${r.in_date??''}`;
  if(!ts||!r.l1_code||!r.l2_code||!r.l3_code){plan.rejected.push(`rejected_row_shape:${tag}`);continue;}
  const inDate=ymdToIso(r.in_date),outDate=ymdToIso(r.out_date);
  if(!inDate||outDate===undefined){plan.rejected.push(`rejected_date:${tag}`);continue;}
  if(outDate!==null&&outDate<inDate){plan.rejected.push(`rejected_window:${tag}`);continue;}   // out_date is the last member day (inclusive, K3)
  const codes={l1_code:canonicalSwCode(r.l1_code),l2_code:canonicalSwCode(r.l2_code),l3_code:canonicalSwCode(r.l3_code)};
  const aliased=Object.fromEntries((['l1_code','l2_code','l3_code'] as const).filter(f=>codes[f]!==r[f]).map(f=>[f,r[f]]));
  const locator:Record<string,unknown>={...r.locator,...(Object.keys(aliased).length?{code_aliases:aliased}:{})};
  const input:SourceMembershipInput={source:SW_MEMBER_SOURCE,ts_code:ts,name:r.name,...codes,in_date:inDate,out_date:outDate,observed_at:r.fetched_at,raw_hash:r.raw_hash,locator};
  if(known){
   const list=[codes.l1_code,codes.l2_code,codes.l3_code];
   if(known instanceof Map){
    const bad=list.filter((c,i)=>known.get(c)?.level!==i+1);   // absent, or present at another level
    if(bad.length){plan.unknownCodes.push({tag,codes:bad,row:input,reason:'classification_code_unknown'});continue;}
    if(known.get(codes.l2_code)!.parent_code!==codes.l1_code||known.get(codes.l3_code)!.parent_code!==codes.l2_code){
     plan.unknownCodes.push({tag,codes:list,row:input,reason:'classification_hierarchy_mismatch'});continue;
    }
   }else{
    const missing=list.filter(c=>!(known as ReadonlySet<string>).has(c));
    if(missing.length){plan.unknownCodes.push({tag,codes:missing,row:input,reason:'classification_code_unknown'});continue;}
   }
  }
  const k=sourceKey(input);
  (groups.get(k)??groups.set(k,[]).get(k)!).push(input);
 }
 const currentByKey=new Map(current.filter(c=>c.status==='current').map(c=>[sourceKey(c),c]));
 for(const [key,list] of groups){
  if(list.some(x=>!sameContent(x,list[0]))){plan.ambiguous.push({key,rows:list});continue;}
  plan.duplicatesInFetch+=list.length-1;
  const next=list[0];plan.inputs.push(next);
  const old=currentByKey.get(key);
  if(!old){plan.expected.newKeys++;continue;}
  if(sameContent(old,next)){plan.expected.unchanged++;continue;}
  const nullToDate=isNullToDate(old,next);
  plan.expected[nullToDate?'nullToDate':'changed']++;
  plan.changes.push({key,old,next,nullToDate});
 }
 return plan;
}

export interface SourceOverlap{ts_code:string;a:Pick<SourceMembershipInput,'l3_code'|'in_date'|'out_date'|'raw_hash'|'locator'>;b:Pick<SourceMembershipInput,'l3_code'|'in_date'|'out_date'|'raw_hash'|'locator'>}
const nextDay=(d:string)=>new Date(Date.parse(`${d}T00:00:00Z`)+86_400_000).toISOString().slice(0,10);
const endExclusive=(r:{out_date:string|null})=>r.out_date===null?'9999-12-31':nextDay(r.out_date);
/**
 * Pure (spec §4.4 K3 cross-L1 continuity). Windows [in_date, out_date + 1) of one ts_code under DIFFERENT l3 codes must not
 * overlap. Looks at the planned inputs together with the current records that this fetch does not replace; only pairs with at
 * least one planned input are reported (sorted by ts_code, then l3 codes and dates).
 */
export function findSourceOverlaps(inputs:SourceMembershipInput[],current:SourceMembershipRow[]):SourceOverlap[]{
 const incoming=new Set(inputs.map(sourceKey));
 type W=SourceOverlap['a']&{planned:boolean;ts_code:string};
 const byTs=new Map<string,W[]>();
 const add=(r:{ts_code:string;l3_code:string;in_date:string;out_date:string|null;raw_hash:string;locator:Record<string,unknown>},planned:boolean)=>
  (byTs.get(r.ts_code)??byTs.set(r.ts_code,[]).get(r.ts_code)!).push({ts_code:r.ts_code,l3_code:r.l3_code,in_date:r.in_date,out_date:r.out_date,raw_hash:r.raw_hash,locator:r.locator,planned});
 for(const r of inputs)add(r,true);
 for(const c of current)if(c.status==='current'&&!incoming.has(sourceKey(c)))add(c,false);
 const out:SourceOverlap[]=[];
 for(const [ts,ws] of [...byTs].sort(([x],[y])=>x<y?-1:x>y?1:0)){
  const sorted=[...ws].sort((x,y)=>x.in_date.localeCompare(y.in_date)||x.l3_code.localeCompare(y.l3_code));
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
   const a=sorted[i],b=sorted[j];
   if(a.l3_code===b.l3_code||!(a.planned||b.planned))continue;
   if(a.in_date<endExclusive(b)&&b.in_date<endExclusive(a)){
    const pick=({l3_code,in_date,out_date,raw_hash,locator}:W)=>({l3_code,in_date,out_date,raw_hash,locator});
    out.push({ts_code:ts,a:pick(a),b:pick(b)});
   }
  }
 }
 return out;
}

export interface RunMembershipsSwOptions{apply:boolean;l1Codes?:string[];triggeredBy?:TriggeredBy;sleep?:(ms:number)=>Promise<void>;pageSize?:number;snapshots?:SnapshotCapture}
export interface RunMembershipsSwResult extends Omit<RunResult,'status'|'batchId'>{status:RunResult['status']|'dry_run';batchId:string|null;plans:{l1:string;expected:SourcePlan['expected'];inputs:number;ambiguous:number;rejected:number;unknownCodes:number}[]}

const contentDigest=(r:ContentFields)=>createHash('sha256').update(JSON.stringify([r.name,r.l1_code,r.l2_code,r.out_date])).digest('hex').slice(0,12);
const contentOf=(r:ContentFields&{raw_hash:string}|SourceMembershipRow)=>({name:r.name,l1_code:r.l1_code,l2_code:r.l2_code,out_date:r.out_date,raw_hash:r.raw_hash});

/**
 * Job step after runClassificationsSw. Phases: (1) both passes of every requested L1, each L1 fetched under its own error
 * handler; (2) ONE global plan (all pages, all current records) — natural keys are de-duplicated across L1s, record changes
 * are looked up by natural key; (3) quarantine of what cannot be written (unknown codes / ancestry, ambiguous rows — one item
 * per row, overlaps across l3 codes); (4) upsert per L1 group, every change that is not null→date quarantined. Every
 * database call after startBatch sits under a handler that records the error and continues (a failed quarantine write counts
 * the row failed, or — when the row was already counted — only adds `quarantine_error`); finishBatch and recordAttempt
 * are always reached, so a batch is never left running.
 */
export async function runMembershipsSw(deps:IndustryDeps,opts:RunMembershipsSwOptions):Promise<RunMembershipsSwResult>{
 if(opts.apply&&!deps.codeVersion)throw new Error('code_version_missing');
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const tree=await deps.db.classificationTree('sw2021','2021');
 const l1s=tree.filter(n=>n.level===1).map(n=>n.code).filter(c=>!opts.l1Codes||opts.l1Codes.includes(c)).sort();
 const known:KnownTree=new Map(tree.map(n=>[n.code,{level:n.level,parent_code:n.parent_code}]));
 const counts=emptyCounts();const errors:BatchError[]=[];const rejected:string[]=[];const plans:RunMembershipsSwResult['plans']=[];
 const batchId=opts.apply?(await startBatch(deps.tables,{producer:SW_SOURCE_PRODUCER,dataset:SW_SOURCE_DATASET,codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy??'script'})).batchId:null;
 let crashed=false;
 /** Quarantine for a row that is NOT otherwise counted: success → quarantined, failure → failed (+ quarantine_error). */
 const park=async(input:{naturalKey:string;reasonCode:string;detail:Record<string,unknown>;payload:Record<string,unknown>},error:BatchError)=>{
  await parkConflict(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',...input,batchId:batchId!},counts,errors,error);
 };
 try{
  if(l1s.length===0)errors.push({code:'no_classifications',message:'run classifications first'});
  const byL1=new Map<string,FetchedMember[]>();
  for(const l1 of l1s){
   let pages:TusharePage<IndexMemberRow>[];
   try{
    pages=[];
    for(const isNew of ['Y','N'] as const)pages.push(...await fetchIndexMembers(call,{l1Code:l1,isNew},{sleep:opts.sleep,now:deps.now,pageSize:opts.pageSize,snapshots:batchId?opts.snapshots:undefined}));
   }catch(e){
    errors.push({code:e instanceof IndustryProviderError?e.code:'fetch_error',key:l1,message:errorMessage(e)});
    if(e instanceof IndustryProviderError&&e.code==='quota_exhausted')break;
    continue;
   }
   const rows:FetchedMember[]=pages.flatMap(p=>p.rows.map((r,i)=>({...r,raw_hash:p.raw_hash,locator:locatorOf(p,i),fetched_at:p.fetched_at})));
   counts.fetched+=rows.length;byL1.set(l1,rows);
  }
  const all=[...byL1.values()].flat();
  let current:SourceMembershipRow[]=[];
  let readOk=true;
  if(all.length>0){
   try{current=await deps.db.currentSourceMemberships({});}
   catch(e){readOk=false;errors.push({code:'db_error',message:`current records: ${errorMessage(e)}`});}
  }
  if(readOk){
   for(const [l1,rows] of byL1){
    const p=planSourceMemberships(rows,current,known);
    plans.push({l1,expected:p.expected,inputs:p.inputs.length,ambiguous:p.ambiguous.length,rejected:p.rejected.length,unknownCodes:p.unknownCodes.length});
   }
   const plan=planSourceMemberships(all,current,known);
   rejected.push(...plan.rejected);
   if(batchId){
    counts.duplicates+=plan.duplicatesInFetch;
    for(const u of plan.unknownCodes)
     await park({naturalKey:sourceKey(u.row),reasonCode:u.reason,detail:{codes:u.codes},payload:{row:u.row}},{code:u.reason,key:u.tag});
    for(const a of plan.ambiguous)
     for(const row of a.rows)   // one item per ambiguous input row; every variant stays in each payload
      await park({naturalKey:`${a.key}#${contentDigest(row)}`,reasonCode:'source_membership_ambiguous',detail:{rows:a.rows.length},payload:{row,variants:a.rows.map(contentOf)}},{code:'source_membership_ambiguous',key:a.key});
    for(const o of findSourceOverlaps(plan.inputs,current)){
     const key=`sw2021:2021:overlap:${o.ts_code}:${o.a.l3_code}:${o.a.in_date}~${o.b.l3_code}:${o.b.in_date}`;
     errors.push({code:'source_membership_overlap',key:o.ts_code});   // not a row outcome: no count
     try{await quarantine(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',naturalKey:key,reasonCode:'source_membership_overlap',detail:{ts_code:o.ts_code},payload:{a:o.a,b:o.b},batchId});}
     catch(e){errors.push({code:'quarantine_error',key:o.ts_code,message:errorMessage(e)});}
    }
    const oldById=new Map(current.map(c=>[c.id,c]));
    const groups=new Map<string,SourceMembershipInput[]>();
    for(const x of plan.inputs)(groups.get(x.l1_code)??groups.set(x.l1_code,[]).get(x.l1_code)!).push(x);
    for(const [l1,inputs] of [...groups].sort(([x],[y])=>x<y?-1:x>y?1:0)){
     try{
      const res=await deps.db.upsertSourceMemberships(batchId,inputs);
      counts.inserted+=res.inserted;counts.versioned+=res.superseded;counts.duplicates+=res.duplicates;
      for(const ch of res.changed){
       if(ch.nullToDate)continue;
       const old=oldById.get(ch.old_id);
       const key=old?sourceKey(old):ch.old_id;
       const next=inputs.find(x=>sourceKey(x)===key)??null;
       errors.push({code:'source_membership_changed',key});
       try{
        await quarantine(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',naturalKey:key,reasonCode:'source_membership_changed',
         detail:{old_id:ch.old_id,new_id:ch.new_id},payload:{key,old:old?contentOf(old):null,next:next?contentOf(next):null},batchId});
       }catch(e){errors.push({code:'quarantine_error',key,message:errorMessage(e)});}   // the row is already counted (versioned)
      }
     }catch(e){counts.failed+=inputs.length;errors.push({code:'upsert_error',key:l1,message:errorMessage(e)});}
    }
   }
  }else if(batchId)counts.failed+=counts.fetched;   // nothing could be planned or written
 }catch(e){
  crashed=true;
  errors.push({code:'db_error',message:errorMessage(e)});
 }
 const rejectedSummary=summarizeSkips(rejected);
 const allErrors=withSkippedSummary(errors,{},rejectedSummary);
 if(!batchId)return {status:'dry_run',batchId:null,counts,errors:allErrors,exitCode:allErrors.some(e=>e.code==='db_error')?1:0,plans};
 const status=await finishBatch(deps.tables,batchId,{counts,errors:allErrors},deps.now());
 const outcome=loaderOutcome(status,counts,rejectedSummary);
 await recordAttempt(deps.tables,SW_SOURCE_DATASET,{ok:outcome.ok&&!crashed,cadence:'weekly',now:deps.now()});
 return {status,batchId,counts,errors:allErrors,exitCode:crashed?1:outcome.exitCode,plans};
}
