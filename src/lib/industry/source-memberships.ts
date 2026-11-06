// src/lib/industry/source-memberships.ts
// SW2021 source records (spec §4.4): immutable import evidence in industry_source_memberships, separate from
// resolved memberships. Two passes per L1 (is_new 'Y' current, 'N' historical), has_more paging, one raw_hash
// per page and a row locator per record. Record key (scheme, version, source, ts_code, l3_code, in_date);
// content = name, l1_code, l2_code, out_date (raw_hash / locator / observed_at are evidence, not content).
// planSourceMemberships (pure): normalizes dates, rejects malformed rows (rejected_summary), de-duplicates the
// same key within one fetch (identical content → one input), parks a key seen with DIFFERENT content within one
// fetch as `source_membership_ambiguous` (nothing written for it), and classifies each input against the
// current records: new key / unchanged / out_date null→date / other change (expected counts for dry runs).
// Spec 7th draft K3: member codes go through SW2021_CODE_ALIASES; a row whose L1/L2/L3 code is not in the
// classification tree is quarantined classification_code_unknown (not written); out_date is inclusive, so only
// out_date < in_date is rejected. Coverage of moves holds only over all 31 L1 × {Y, N} passes (K3).
// runMembershipsSw writes through IndustryDb.upsertSourceMemberships (rpc upsert_industry_source_memberships;
// the SQL decides duplicates/supersession and returns `changed`); every change that is not null→date is
// quarantined `source_membership_changed` (payload old + new content) and makes the batch partial.
// The resolver (resolve-memberships.ts) runs after this as its own step.
import type {BatchError,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {errorMessage,loaderOutcome,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import type {IndustryDeps,SourceMembershipInput,SourceMembershipRow} from './types';
import type {IndexMemberRow,RowLocator,TusharePage} from './providers/tushare-industry';
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
export interface SourcePlan{
 inputs:SourceMembershipInput[];duplicatesInFetch:number;ambiguous:{key:string;rows:SourceMembershipInput[]}[];rejected:string[];
 /** member rows whose (aliased) L1/L2/L3 code is not in the classification tree (spec 7th draft K3) */
 unknownCodes:{tag:string;codes:string[];row:SourceMembershipInput}[];
 expected:{newKeys:number;unchanged:number;nullToDate:number;changed:number};changes:SourceChange[];
}

/**
 * Pure. `rows` = every record of one fetch (both passes of the L1s covered); `current` = current records of those L1s;
 * `known` = codes of the classification tree (omitted → no code check). Member codes are mapped through
 * SW2021_CODE_ALIASES first (the original code is kept in locator.code_aliases).
 */
export function planSourceMemberships(rows:FetchedMember[],current:SourceMembershipRow[],known?:ReadonlySet<string>):SourcePlan{
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
   const missing=[codes.l1_code,codes.l2_code,codes.l3_code].filter(c=>!known.has(c));
   if(missing.length){plan.unknownCodes.push({tag,codes:missing,row:input});continue;}
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

export interface RunMembershipsSwOptions{apply:boolean;l1Codes?:string[];triggeredBy?:TriggeredBy;sleep?:(ms:number)=>Promise<void>;pageSize?:number}
export interface RunMembershipsSwResult extends Omit<RunResult,'status'|'batchId'>{status:RunResult['status']|'dry_run';batchId:string|null;plans:{l1:string;expected:SourcePlan['expected'];inputs:number;ambiguous:number;rejected:number;unknownCodes:number}[]}

/** Job step after runClassificationsSw: both passes per L1 → plan → upsert → quarantine changes; weekly freshness. */
export async function runMembershipsSw(deps:IndustryDeps,opts:RunMembershipsSwOptions):Promise<RunMembershipsSwResult>{
 if(opts.apply&&!deps.codeVersion)throw new Error('code_version_missing');
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const tree=await deps.db.classificationTree('sw2021','2021');
 const l1s=tree.filter(n=>n.level===1).map(n=>n.code).filter(c=>!opts.l1Codes||opts.l1Codes.includes(c)).sort();
 const known=new Set(tree.map(n=>n.code));
 const counts=emptyCounts();const errors:BatchError[]=[];const rejected:string[]=[];const plans:RunMembershipsSwResult['plans']=[];
 const batchId=opts.apply?(await startBatch(deps.tables,{producer:SW_SOURCE_PRODUCER,dataset:SW_SOURCE_DATASET,codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy??'script'})).batchId:null;
 if(l1s.length===0)errors.push({code:'no_classifications',message:'run classifications first'});
 for(const l1 of l1s){
  let pages:TusharePage<IndexMemberRow>[];
  try{
   pages=[];
   for(const isNew of ['Y','N'] as const)pages.push(...await fetchIndexMembers(call,{l1Code:l1,isNew},{sleep:opts.sleep,now:deps.now,pageSize:opts.pageSize}));
  }catch(e){
   errors.push({code:e instanceof IndustryProviderError?e.code:'fetch_error',key:l1,message:errorMessage(e)});
   if(e instanceof IndustryProviderError&&e.code==='quota_exhausted')break;
   continue;
  }
  const rows:FetchedMember[]=pages.flatMap(p=>p.rows.map((r,i)=>({...r,raw_hash:p.raw_hash,locator:locatorOf(p,i),fetched_at:p.fetched_at})));
  counts.fetched+=rows.length;
  const current=await deps.db.currentSourceMemberships({l1Code:l1});
  const plan=planSourceMemberships(rows,current,known);
  rejected.push(...plan.rejected);
  plans.push({l1,expected:plan.expected,inputs:plan.inputs.length,ambiguous:plan.ambiguous.length,rejected:plan.rejected.length,unknownCodes:plan.unknownCodes.length});
  if(!batchId)continue;
  counts.duplicates+=plan.duplicatesInFetch;
  for(const u of plan.unknownCodes){
   await quarantine(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',naturalKey:sourceKey(u.row),reasonCode:'classification_code_unknown',detail:{codes:u.codes},payload:{row:u.row},batchId});
   counts.quarantined++;errors.push({code:'classification_code_unknown',key:u.tag});
  }
  for(const a of plan.ambiguous){
   await quarantine(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',naturalKey:a.key,reasonCode:'source_membership_ambiguous',detail:{rows:a.rows.length},payload:{rows:a.rows},batchId});
   counts.quarantined+=a.rows.length;
  }
  if(plan.inputs.length===0)continue;
  try{
   const res=await deps.db.upsertSourceMemberships(batchId,plan.inputs);
   counts.inserted+=res.inserted;counts.versioned+=res.superseded;counts.duplicates+=res.duplicates;
   const oldById=new Map(current.map(c=>[c.id,c]));
   for(const ch of res.changed){
    if(ch.nullToDate)continue;
    const old=oldById.get(ch.old_id);
    const key=old?sourceKey(old):ch.old_id;
    const next=plan.inputs.find(x=>sourceKey(x)===key)??null;
    await quarantine(deps.tables,{dataset:SW_SOURCE_DATASET,table:'industry_source_memberships',naturalKey:key,reasonCode:'source_membership_changed',
     detail:{old_id:ch.old_id,new_id:ch.new_id},payload:{old:old?{name:old.name,l1_code:old.l1_code,l2_code:old.l2_code,out_date:old.out_date,raw_hash:old.raw_hash}:null,next:next?{name:next.name,l1_code:next.l1_code,l2_code:next.l2_code,out_date:next.out_date,raw_hash:next.raw_hash}:null},batchId});
    errors.push({code:'source_membership_changed',key});
   }
  }catch(e){counts.failed+=plan.inputs.length;errors.push({code:'upsert_error',key:l1,message:errorMessage(e)});}
 }
 const rejectedSummary=summarizeSkips(rejected);
 const allErrors=withSkippedSummary(errors,{},rejectedSummary);
 if(!batchId)return {status:'dry_run',batchId:null,counts,errors:allErrors,exitCode:0,plans};
 const status=await finishBatch(deps.tables,batchId,{counts,errors:allErrors},deps.now());
 const outcome=loaderOutcome(status,counts,rejectedSummary);
 await recordAttempt(deps.tables,SW_SOURCE_DATASET,{ok:outcome.ok,cadence:'weekly',now:deps.now()});
 return {status,batchId,counts,errors:allErrors,exitCode:outcome.exitCode,plans};
}
