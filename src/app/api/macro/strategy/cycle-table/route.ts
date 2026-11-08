// src/app/api/macro/strategy/cycle-table/route.ts
// GET /api/macro/strategy/cycle-table?boundary=event_day|first_trading_day|month_end (default event_day; spec §8, §5.5): shared-cached view.
// one frozen cycle_table manifest per boundary (in its params) → policy action episodes × asset interval changes.
import {NextResponse} from 'next/server';
import {buildCycleTable,buildCycleTableManifest} from '@/lib/macro/strategy/cycle-table';
import {canCacheFacts,factView,memoKey,readMemoState} from '@/lib/macro/strategy/memo';
import {ParamError,memoHeaders,boundaryOf,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

type FailureStage='read_gate'|'read_state'|'build_manifest'|'persist_manifest'|'evaluate_view'|'fact_cache'|'serialize_response';
/** Carry only a fixed label through singleflight: every waiter sees the originating stage.
 * Never retain the original exception, which may contain upstream credentials or frozen evidence. */
class CycleStageFailure extends Error{
 constructor(readonly stage:FailureStage){super('macro_cycle_stage_failed');}
}
async function atStage<T>(stage:FailureStage,run:()=>T|Promise<T>):Promise<T>{
 try{return await run();}
 catch(e){if(e instanceof CycleStageFailure||e instanceof ParamError)throw e;throw new CycleStageFailure(stage);}
}

export async function GET(req:Request){
 try{
  const g=await atStage('read_gate',readGate);if(!g.ok)return g.res;
  const boundary=boundaryOf(readParams(new URL(req.url),['boundary']).get('boundary'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const {port}=g;
  const state=await atStage('read_state',()=>readMemoState(port));
  const compute=async()=>{
   const manifest=await atStage('build_manifest',()=>buildCycleTableManifest(port,{now:new Date(),codeVersion,boundary,snapshots:state.snapshots}));
   const stored=await atStage('persist_manifest',()=>strategyDb().putManifest(manifest));
   return {manifest_id:stored.manifest_id,view:await atStage('evaluate_view',()=>buildCycleTable(stored))};
  };
  const {value,outcome}=await atStage('fact_cache',()=>factView(canCacheFacts(state)?memoKey({kind:'cycle_table',params:{boundary},state,codeVersion}):'',state,compute));
  return await atStage('serialize_response',()=>NextResponse.json(value.view,{headers:memoHeaders(outcome)}));
 }catch(e){
  if(!(e instanceof ParamError))console.error('[macro-cycle-table]',{stage:e instanceof CycleStageFailure?e.stage:'request_setup'});
  return failureResponse(e);
 }
}
