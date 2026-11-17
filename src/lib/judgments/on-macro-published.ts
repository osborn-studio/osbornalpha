// Server composition only: imported by macro write deps, never by snapshot/read-model core.
// The publication is already committed. A failed hook leaves recovery to settlement compensation;
// it must not move that scan's marker or look up a newer active snapshot.
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {macroJudgmentsEnabled} from '../macro/flags';
import type {OnPublished} from '../macro/snapshots';
import {productionJudgmentDeps} from './deps';
import {produce} from './produce';
import {REGISTRY} from './registry';
import {resolverFor} from './resolvers';

export function productionMacroJudgmentHook(options:{codeVersion:string;triggeredBy:'cron'|'script'}):OnPublished{
 return async snapshot=>{
  // Gate again before allocating service dependencies, including direct hook callers.
  if(!macroJudgmentsEnabled())return;
  const methodology=REGISTRY.find(m=>m.id==='macro_regime'&&m.version==='v2');
  if(!methodology)throw new Error('macro_methodology_missing');
  const signal=AbortSignal.timeout(60_000);
  const deps=productionJudgmentDeps({...options,actor:options.triggeredBy,signal});
  const {batchId}=await startBatch(deps.tables,{producer:'ts-judgments',dataset:'judgments.produce.macro_regime',...options});
  let counts={...emptyCounts(),fetched:1,failed:1};
  let errors:import('../dq/batches').BatchError[]=[{code:'produce_failed',key:snapshot.snapshot_id}];
  try{
   const result=await produce(methodology,[{subject:{type:'macro_region',key:snapshot.region},asOf:snapshot.as_of,binding:{snapshot_id:snapshot.snapshot_id}}],{
    ...deps,batchId,codeVersion:options.codeVersion,signal,actor:options.triggeredBy,resolverOf:resolverFor,
   });
   counts=result.counts;errors=result.errors;
   // produce reports item failures rather than throwing. Do not misreport hook=ok.
   if(counts.failed||counts.quarantined||counts.inserted+counts.duplicates!==1)throw new Error('macro_judgment_production_failed');
  }finally{
   await finishBatch(deps.tables,batchId,{counts,errors});
  }
 };
}
