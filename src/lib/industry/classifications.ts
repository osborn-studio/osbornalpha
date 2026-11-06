// src/lib/industry/classifications.ts
// SW2021 classification nodes (spec §4.2). Three index_classify calls (L1/L2/L3, src=SW2021); code = index_code.
// parent_code namespace (spec 7th draft K3, verified 2026-11-06): upstream parent_code is the parent's
// industry_code (134/134 L2 and 346/346 L3); an index_code is still accepted defensively.
// planClassificationNodes maps each node's parent within the SAME batch: an index_code of level-1 → used as is;
// an industry_code of a level-1 node → translated to that node's index_code (attributes.parent_via records which;
// the raw upstream value is kept in attributes.parent_industry_code);
// level 1 must have a root parent ('0' / '' / null). Anything else, and every descendant of an unmapped node, is
// quarantined `classification_parent_unmapped` and not written (the FK on parent_code would reject it anyway).
// Nodes are only added (upsertClassifications); a node whose stored name/level/parent differs is returned as a
// conflict and quarantined `classification_name_conflict` (never overwritten). attributes hold only stable upstream
// fields (no raw_hash / locator: a re-fetch must compare equal); the batch receipt is the node's evidence.
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {errorMessage,loaderOutcome,parkConflict,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import type {ClassificationRow,IndustryDeps} from './types';
import type {IndexClassifyRow,RowLocator,TusharePage} from './providers/tushare-industry';
import {defaultTushareCall,fetchIndexClassify,locatorOf} from './providers/tushare-industry';

export const SW_CLASSIFY_DATASET='industry.sw2021.classifications';
export const SW_CLASSIFY_PRODUCER='industry-sw-classify';
const LEVEL:Record<string,number>={L1:1,L2:2,L3:3};
const ROOT=new Set(['','0']);

export interface ClassifyInputRow extends IndexClassifyRow{raw_hash:string;locator:RowLocator}
export interface UnmappedNode{code:string;level:number;raw_parent_code:string|null;reason:'parent_not_found'|'parent_level_mismatch'|'parent_unmapped'|'root_with_parent';raw_hash:string;locator:RowLocator}
export interface ClassificationPlan{nodes:ClassificationRow[];unmapped:UnmappedNode[];rejected:string[]}

/** Pure. Rows of all three levels of ONE batch → nodes ordered parents first. */
export function planClassificationNodes(rows:ClassifyInputRow[]):ClassificationPlan{
 const plan:ClassificationPlan={nodes:[],unmapped:[],rejected:[]};
 const valid:(ClassifyInputRow&{lvl:number})[]=[];
 const seen=new Set<string>();
 for(const r of rows){
  const lvl=LEVEL[r.level??''];
  if(!r.index_code||!lvl){plan.rejected.push(`rejected_row_shape:${r.index_code??''}`);continue;}
  if(r.src!=='SW2021'){plan.rejected.push(`rejected_src:${r.index_code}`);continue;}
  if(!r.industry_name){plan.rejected.push(`rejected_name:${r.index_code}`);continue;}
  if(seen.has(r.index_code)){plan.rejected.push(`rejected_repeated:${r.index_code}`);continue;}
  seen.add(r.index_code);valid.push({...r,lvl});
 }
 const byIndex=new Map(valid.map(r=>[r.index_code,r]));
 const byIndustry=new Map(valid.filter(r=>r.industry_code).map(r=>[r.industry_code!,r]));
 const written=new Set<string>();
 for(const lvl of [1,2,3]){
  for(const r of valid.filter(v=>v.lvl===lvl)){
   const raw=r.parent_code;
   const miss=(reason:UnmappedNode['reason'])=>plan.unmapped.push({code:r.index_code,level:lvl,raw_parent_code:raw,reason,raw_hash:r.raw_hash,locator:r.locator});
   let parent:string|null=null;let via:'root'|'index_code'|'industry_code'='root';
   if(lvl===1){if(raw!==null&&!ROOT.has(raw)){miss('root_with_parent');continue;}}
   else{
    if(raw===null||ROOT.has(raw)){miss('parent_not_found');continue;}
    const direct=byIndex.get(raw),viaIndustry=byIndustry.get(raw);
    const hit=direct??viaIndustry;
    if(!hit){miss('parent_not_found');continue;}
    if(hit.lvl!==lvl-1){miss('parent_level_mismatch');continue;}
    if(!written.has(hit.index_code)){miss('parent_unmapped');continue;}
    parent=hit.index_code;via=direct?'index_code':'industry_code';
   }
   plan.nodes.push({scheme:'sw2021',version:'2021',code:r.index_code,level:lvl,name_zh:r.industry_name,name_en:null,parent_code:parent,
    attributes:{industry_code:r.industry_code,parent_industry_code:raw,parent_via:via,is_pub:r.is_pub,src:r.src}});
   written.add(r.index_code);
  }
 }
 return plan;
}

export interface ClassificationApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>}

/** Writes nodes via IndustryDb.upsertClassifications; unmapped and name conflicts are quarantined under `dataset`. */
export async function applyClassificationNodes(deps:Pick<IndustryDeps,'tables'|'db'>,batchId:string,plan:ClassificationPlan,dataset:string,fetched:number):Promise<ClassificationApplyResult>{
 const counts=emptyCounts();counts.fetched=fetched;const errors:BatchError[]=[];
 for(const u of plan.unmapped)
  await parkConflict(deps.tables,{dataset,table:'industry_classifications',naturalKey:`${u.level}:${u.code}`,reasonCode:'classification_parent_unmapped',detail:{reason:u.reason,raw_parent_code:u.raw_parent_code},payload:{code:u.code,level:u.level,raw_hash:u.raw_hash,locator:u.locator},batchId},counts,errors,{code:'classification_parent_unmapped',key:u.code,message:u.reason});
 if(plan.nodes.length){
  const res=await deps.db.upsertClassifications(batchId,plan.nodes);
  counts.inserted+=res.inserted;counts.duplicates+=res.unchanged;
  for(const c of res.conflicts)
   await parkConflict(deps.tables,{dataset,table:'industry_classifications',naturalKey:`${c.scheme}:${c.version}:${c.code}`,reasonCode:'classification_name_conflict',detail:{incoming:{name_zh:c.name_zh,name_en:c.name_en,level:c.level,parent_code:c.parent_code}},payload:{...c},batchId},counts,errors,{code:'classification_name_conflict',key:c.code});
 }
 const skippedSummary={};const rejectedSummary=summarizeSkips(plan.rejected);
 return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
}

export interface RunClassificationsOptions{triggeredBy?:TriggeredBy;sleep?:(ms:number)=>Promise<void>}
export interface RunResult{status:BatchStatus;batchId:string;counts:BatchCounts;errors:BatchError[];exitCode:0|1}

/** Job step: L1, L2, L3 index_classify → plan → apply; receipt + weekly freshness. */
export async function runClassificationsSw(deps:IndustryDeps,opts:RunClassificationsOptions={}):Promise<RunResult>{
 if(!deps.codeVersion)throw new Error('code_version_missing');
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const {batchId}=await startBatch(deps.tables,{producer:SW_CLASSIFY_PRODUCER,dataset:SW_CLASSIFY_DATASET,codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'});
 let result:ClassificationApplyResult;
 try{
  const pages:TusharePage<IndexClassifyRow>[]=[];
  for(const level of ['L1','L2','L3'] as const)pages.push(...await fetchIndexClassify(call,{level},{sleep:opts.sleep,now:deps.now}));
  const rows:ClassifyInputRow[]=pages.flatMap(p=>p.rows.map((r,i)=>({...r,raw_hash:p.raw_hash,locator:locatorOf(p,i)})));
  result=await applyClassificationNodes(deps,batchId,planClassificationNodes(rows),SW_CLASSIFY_DATASET,rows.length);
 }catch(e){
  const code=(e as {code?:unknown}).code;
  const errors=[{code:typeof code==='string'?code:'classification_error',message:errorMessage(e)}];
  const status=await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors},deps.now());
  await recordAttempt(deps.tables,SW_CLASSIFY_DATASET,{ok:false,cadence:'weekly',now:deps.now()});
  return {status,batchId,counts:emptyCounts(),errors,exitCode:1};
 }
 const status=await finishBatch(deps.tables,batchId,{counts:result.counts,errors:result.errors},deps.now());
 const outcome=loaderOutcome(status,result.counts,result.rejectedSummary);
 await recordAttempt(deps.tables,SW_CLASSIFY_DATASET,{ok:outcome.ok,cadence:'weekly',now:deps.now()});
 return {status,batchId,counts:result.counts,errors:result.errors,exitCode:outcome.exitCode};
}
