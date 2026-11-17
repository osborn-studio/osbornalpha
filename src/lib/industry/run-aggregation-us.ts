// US SIC snapshot aggregation (§19), deliberately no cross-run reuse in v1. One snapshot membership
// set and one US envelope per issuer serve all buckets. Reads/uploads are bounded (default sixteen);
// staging follows code/bucket/metric order regardless of completion order. dryRun computes and
// self-checks every manifest with zero mutations, including no batch, quarantine or freshness writes.
import type {TriggeredBy,BatchError} from '../dq/batches';
import {emptyCounts,startBatch,finishBatch} from '../dq/batches';
import {quarantine} from '../dq/quarantine';
import {recordAttempt} from '../dq/freshness';
import {FORMULA_VERSION} from '../facts/derive';
import type {FilingRow} from '../facts/types';
import {computeAggregateCellUs} from './aggregate-us';
import type {IssuerFacts} from './aggregate';
import {aggregationPreview,mapBounded,memberOf,rowOf} from './aggregation-common';
import {buildAggregateManifest,encodeManifest} from './manifest';
import {membersAtPure} from './memberships';
import {assertDay,cellKey} from './method';
import {AGG_CONCEPTS_US,CONFIG_HASH_US,METHOD_VERSION_US,READINESS_MIN_PERCENT_US,expectedGridUs} from './method-us';
import {replayFromManifest} from './replay';
import type {AggregationHooks,AggregationReceipt,AggregationTimings} from './run-aggregation';
import {IndustryDbError} from './types';
import type {IndustryDeps,RunDependency,StagedMetricCell} from './types';
export interface AggregationOptionsUs{factsAsOf:string;dryRun?:boolean;triggeredBy?:TriggeredBy;concurrency?:number}
export const AGGREGATION_CONCURRENCY_US=16;
class RunError extends Error{constructor(public code:string,message=code){super(message);}}
export async function runIndustryAggregationUs(deps:IndustryDeps,opts:AggregationOptionsUs,hooks:AggregationHooks={}):Promise<AggregationReceipt>{
 const timings:AggregationTimings={members:0,envelopes:0,filings:0,compute:0,manifests:0,stage:0,activate:0,total:0};
 const started=deps.now().getTime();let phase:Exclude<keyof AggregationTimings,'total'>='members',phaseStarted=started;
 const mark=(next:typeof phase)=>{const now=deps.now().getTime();timings[phase]+=Math.max(0,now-phaseStarted);phase=next;phaseStarted=now;};
 const concurrency=opts.concurrency??AGGREGATION_CONCURRENCY_US;
 const receipt:AggregationReceipt={timings,status:'rejected',batchId:null,batchStatus:null,runId:null,generation:null,activatedAt:null,historyClass:'reconstruction',groups:0,reusedGroups:0,cells:{ok:0,missing:0},manifestMismatches:0,truncatedIssuers:[]};
 assertDay('factsAsOf',opts.factsAsOf);
 if(!deps.codeVersion)return {...receipt,code:'code_version_missing'};
 const {db,tables,facts,manifests}=deps,dataset='industry.agg.sic',dry=opts.dryRun===true;
 const counts=emptyCounts(),errors:BatchError[]=[];let ok=false;
 try{
  if(!dry)receipt.batchId=(await startBatch(tables,{producer:'industry-agg',dataset,toolVersions:{method:METHOD_VERSION_US,config:CONFIG_HASH_US,formula:FORMULA_VERSION},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'})).batchId;
  const tree=await db.classificationTree('sic','sec-current');
  const codes=tree.filter(n=>n.level===1).map(n=>n.code).sort();
  if(!codes.length)throw new RunError('no_classifications');
  const grid=expectedGridUs(codes,opts.factsAsOf);
  const membersByCode=new Map(await mapBounded(grid.codes,async code=>{
   const q={scheme:'sic' as const,version:'sec-current' as const,level:1,code,on:opts.factsAsOf,knownBy:opts.factsAsOf};
   return [code,membersAtPure(await db.membershipCandidates(q),q).map(r=>memberOf(r,undefined))] as const;
  },concurrency));
  receipt.groups=grid.codes.length*grid.period_ends.length;
  const universe=[...new Set([...membersByCode.values()].flatMap(xs=>xs.map(x=>x.issuer_id)))].sort();
  const scope=await facts.scopeAll('US'),scopeOf=new Map(scope.map(s=>[s.issuer_id,s]));
  const ready=universe.filter(id=>scopeOf.get(id)?.last_success_at!=null).length;
  const coverage={universe:universe.length,ready,min_percent:READINESS_MIN_PERCENT_US,facts_scope_ready:universe.length>0&&ready*100>=READINESS_MIN_PERCENT_US*universe.length};
  if(!dry){
   const r=await db.createMetricRun({scheme:'sic',version:'sec-current',level:1,facts_as_of:opts.factsAsOf,knowledge_date:opts.factsAsOf,history_class:'reconstruction',method_version:METHOD_VERSION_US,config_hash:CONFIG_HASH_US,formula_version:FORMULA_VERSION,code_version:deps.codeVersion,expected_grid:grid,fingerprint_at:deps.now().toISOString(),reused_from_run:null,batch_id:receipt.batchId!});
   receipt.runId=r.runId;receipt.generation=r.generation;await db.setMetricRunCoverage(r.runId,coverage);
  }
  if(!coverage.facts_scope_ready)throw new RunError('facts_scope_not_ready',`${ready}/${universe.length}`);
  mark('envelopes');
  const issuers=new Map<string,IssuerFacts>(await mapBounded(universe,async id=>{
   const env=await facts.readFacts(id,'US',{concepts:[...AGG_CONCEPTS_US],asOf:opts.factsAsOf,history:true});
   if(env.rows.some(r=>r.issuer_id!==id||r.market!=='US'))throw new RunError('envelope_scope_mismatch',id);
   return [id,{issuer_id:id,stateRev:env.stateRev,truncated:env.truncated,rows:env.truncated?[]:env.rows,derived:[]}] as const;
  },concurrency));
  receipt.truncatedIssuers=universe.filter(id=>issuers.get(id)!.truncated);
  mark('compute');
  const computed=grid.codes.flatMap(code=>grid.period_ends.map(pe=>{
   const members=membersByCode.get(code)!,ids=members.map(x=>x.issuer_id),memberStateRevs=ids.map(issuer_id=>({issuer_id,state_rev:issuers.get(issuer_id)!.stateRev}));
   const result=computeAggregateCellUs({code,period_end:pe,members:ids,issuers});
   return {code,pe,members,memberStateRevs,result};
  }));
  const usedIssuers=[...new Set(computed.flatMap(g=>g.result.facts.map(f=>f.issuer_id)))].sort();
  mark('filings');
  const filings=new Map<string,FilingRow>();
  for(const fs of await mapBounded(usedIssuers,id=>facts.filingsOfIssuer(id,'US',{}),concurrency))for(const f of fs)filings.set(f.filing_id,f);
  mark('manifests');
  const groups=computed.map(({code,pe,members,memberStateRevs,result})=>{
   const manifest=buildAggregateManifest({header:{scheme:'sic',version:'sec-current',code,level:1,period_end:pe,facts_as_of:opts.factsAsOf,knowledge_date:opts.factsAsOf,history_class:'reconstruction',method_version:METHOD_VERSION_US,config_hash:CONFIG_HASH_US,formula_version:FORMULA_VERSION,code_version:deps.codeVersion!},members,unresolved:[],memberStateRevs,result,filings});
   const check=(hooks.replay??replayFromManifest)(manifest),bad=new Set<string>();
   const idsOfCells=new Set(manifest.cells.map(c=>`${c.metric}:${c.duration}:${c.period_start}`));
   for(const mismatch of check.mismatches){
    const id=mismatch.startsWith('unexpected_cell:')?mismatch.slice('unexpected_cell:'.length):mismatch;
    if(!idsOfCells.has(id))throw new RunError('manifest_mismatch',`${cellKey(code,pe)}:${mismatch}`);
    bad.add(id);
   }
   return {code,pe,manifest,bad,encoded:encodeManifest(manifest),memberStateRevs};
  });
  const hashes=await mapBounded(groups,async g=>{
   if(dry||!g.manifest.cells.some(c=>c.status==='ok'&&!g.bad.has(`${c.metric}:${c.duration}:${c.period_start}`)))return g.encoded.hash;
   try{return (await manifests.put('aggregate',g.encoded.canonical)).hash;}catch(e){throw new RunError('manifest_upload_failed',e instanceof Error?e.message:String(e));}
  },concurrency);
  const staged:StagedMetricCell[]=[],dependencies:RunDependency[]=[];
  for(const [i,g] of groups.entries()){
   for(const c of g.manifest.cells){
    const id=`${c.metric}:${c.duration}:${c.period_start}`;
    if(g.bad.has(id)){
     staged.push({...rowOf(g.code,g.pe,c,null),status:'missing',missing_reason:'manifest_mismatch',value:null,manifest_hash:null});
     receipt.manifestMismatches++;counts.quarantined++;
     if(!dry)await quarantine(tables,{dataset,table:'industry_metrics',naturalKey:`${receipt.runId}:${g.code}:${g.pe}:${id}`,reasonCode:'manifest_mismatch',detail:{run_id:receipt.runId,code:g.code,period_end:g.pe,cell:id},batchId:receipt.batchId!});
    }else staged.push(rowOf(g.code,g.pe,c,hashes[i]));
   }
   for(const x of g.memberStateRevs)dependencies.push({cell_key:cellKey(g.code,g.pe),...x});
  }
  receipt.cells={ok:staged.filter(r=>r.status==='ok').length,missing:staged.filter(r=>r.status==='missing').length};
  if(dry){
   const roleReasons:Record<string,number>={},latest=grid.period_ends.at(-1);
   for(const g of computed)if(g.pe===latest)for(const r of g.result.roles)if(r.metric==='revenue_sum'&&r.role==='excluded'&&r.reason)roleReasons[r.reason]=(roleReasons[r.reason]??0)+1;
   receipt.status='dry_run';receipt.preview={...aggregationPreview(staged),roleReasons};return receipt;
  }
  mark('stage');
  await db.setMetricRunCoverage(receipt.runId!,{...coverage,groups:receipt.groups,cells_ok:receipt.cells.ok,cells_missing:receipt.cells.missing,manifest_mismatch:receipt.manifestMismatches,read_truncated:receipt.truncatedIssuers.slice(0,100),read_truncated_count:receipt.truncatedIssuers.length});
  for(let i=0;i<staged.length;i+=500)await db.stageMetricRows(receipt.runId!,staged.slice(i,i+500));
  for(let i=0;i<dependencies.length;i+=2000)await db.stageRunDependencies(receipt.runId!,'aggregate',dependencies.slice(i,i+2000));
  mark('activate');
  receipt.activatedAt=(await db.activateMetricRun(receipt.runId!)).activatedAt;
  receipt.status='active';counts.fetched=staged.length;counts.inserted=staged.length;ok=true;
 }catch(e){
  receipt.status='failed';receipt.code=e instanceof RunError||e instanceof IndustryDbError?e.code:'compute_failed';counts.failed=1;
  errors.push({code:receipt.code,message:(e instanceof Error?e.message:String(e)).slice(0,300)});
  if(!dry&&receipt.runId)try{await db.failRun('aggregate',receipt.runId,receipt.code);}catch(e){errors.push({code:'fail_run_failed',message:String(e).slice(0,300)});}
 }finally{
  mark(phase);
  if(!dry&&receipt.batchId){
   try{await recordAttempt(tables,dataset,{ok,cadence:'weekly',now:deps.now(),detail:{run_id:receipt.runId,status:receipt.status,code:receipt.code??null,cells:receipt.cells}});}catch(e){errors.push({code:'freshness_failed',message:String(e).slice(0,300)});}
   receipt.batchStatus=await finishBatch(tables,receipt.batchId,{counts,errors},deps.now());
  }
  timings.total=Math.max(0,deps.now().getTime()-started);
 }
 return receipt;
}
