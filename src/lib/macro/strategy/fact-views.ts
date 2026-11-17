// Shared pure fact builders for HTTP reads and publish/deploy warming. No sessions or judgments.
import type {Boundary,Region} from './contract';
import type {StrategyDb,FactViewKind} from './db';
import {logStrategyView} from './db';
import {buildTransmission,buildTransmissionManifest} from './transmission';
import {buildPlaybooks} from './playbooks';
import {buildPolicyResponse,buildPolicyResponseManifest} from './policy-response';
import {buildCycleTable,buildCycleTableManifest} from './cycle-table';
import {canCacheFacts,factViewKey,materializeFactView,memoKey,readMemoState,type MemoState} from './memo';
import type {StrategyReadPort} from './port';
import {strategyEnabled} from './flags';

export class NoPublishedSnapshot extends Error{}
export type FailureStage='read_gate'|'read_state'|'build_manifest'|'persist_manifest'|'evaluate_view'|'fact_cache'|'serialize_response';
export class CycleStageFailure extends Error{
 constructor(readonly stage:FailureStage){super('macro_cycle_stage_failed');}
}
export async function atStage<T>(stage:FailureStage,run:()=>T|Promise<T>):Promise<T>{
 try{return await run();}catch(e){if(e instanceof CycleStageFailure)throw e;throw new CycleStageFailure(stage);}
}
type BuildArgs={port:StrategyReadPort;db:StrategyDb;codeVersion:string;now:()=>Date;state:MemoState};
export async function transmissionFacts(a:BuildArgs,region:Region){
 const body=await buildTransmissionManifest(a.port,{now:a.now(),codeVersion:a.codeVersion,region,snapshots:a.state.snapshots});
 if(!body)throw new NoPublishedSnapshot();
 const stored=await a.db.putManifest(body);
 return {manifest_id:stored.manifest_id,transmission:buildTransmission(stored),playbooks:buildPlaybooks(stored.body,region),snapshotId:stored.body.snapshots[region]?.snapshot_id??null};
}
export async function policyResponseFacts(a:BuildArgs,window:1|3|6){
 const stored=await a.db.putManifest(await buildPolicyResponseManifest(a.port,{now:a.now(),codeVersion:a.codeVersion,window,snapshots:a.state.snapshots}));
 return {manifest_id:stored.manifest_id,view:buildPolicyResponse(stored)};
}
export async function cycleTableFacts(a:BuildArgs,boundary:Boundary){
 const manifest=await atStage('build_manifest',()=>buildCycleTableManifest(a.port,{now:a.now(),codeVersion:a.codeVersion,boundary,snapshots:a.state.snapshots}));
 const stored=await atStage('persist_manifest',()=>a.db.putManifest(manifest));
 return {manifest_id:stored.manifest_id,view:await atStage('evaluate_view',()=>buildCycleTable(stored))};
}
const standardViews=[
 ...(['US','CN'] as const).map(region=>({kind:'transmission' as const,params:{region},build:(a:BuildArgs)=>transmissionFacts(a,region)})),
 ...([1,3,6] as const).map(window=>({kind:'policy_response' as const,params:{window},build:(a:BuildArgs)=>policyResponseFacts(a,window)})),
 ...(['event_day','first_trading_day','month_end'] as const).map(boundary=>({kind:'cycle_table' as const,params:{boundary},build:(a:BuildArgs)=>cycleTableFacts(a,boundary)})),
];
export interface WarmViewOutcome{kind:FactViewKind;params:Record<string,string|number>;outcome:'present'|'built'|'failed'|'skipped';ms:number}
export const skippedFactViews=():WarmViewOutcome[]=>standardViews.map(v=>({kind:v.kind,params:v.params,outcome:'skipped',ms:0}));
export async function warmFactViews(a:{port:StrategyReadPort;db:StrategyDb;codeVersion:string;now:()=>Date}):Promise<WarmViewOutcome[]>{
 if(!strategyEnabled())return skippedFactViews();
 let state:MemoState;
 try{state=await readMemoState(a.port);}catch{logStrategyView('warm-failed');return standardViews.map(v=>({kind:v.kind,params:v.params,outcome:'failed',ms:0}));}
 if(!canCacheFacts(state))return skippedFactViews();
 const jobs=standardViews.map(v=>({...v,key:memoKey({kind:v.kind,params:v.params,state,codeVersion:a.codeVersion})}));
 let rows:Awaited<ReturnType<StrategyDb['getStrategyViews']>>=[];
 try{rows=await a.db.getStrategyViews(jobs.map(v=>factViewKey(v.key)));}catch{logStrategyView('read-failed');}
 const existing=new Map(rows.map(r=>[r.view_key,r]));
 const results:WarmViewOutcome[]=new Array(jobs.length);let next=0;
 async function worker(){
  for(let i=next++;i<jobs.length;i=next++){
   const v=jobs[i],start=performance.now();let outcome:WarmViewOutcome['outcome'];
   try{
    const result=await materializeFactView<{manifest_id:string}>(v.key,()=>v.build({...a,state}),a.db,existing.get(factViewKey(v.key))??null);
    outcome=result.source==='stored'?'present':result.persisted?'built':'failed';
   }catch{logStrategyView('warm-failed');outcome='failed';}
   results[i]={kind:v.kind,params:v.params,outcome,ms:performance.now()-start};
  }
 }
 await Promise.all([worker(),worker()]);return results;
}
