// src/app/api/macro/strategy/cycle-table/route.ts
// GET /api/macro/strategy/cycle-table?boundary=event_day|first_trading_day|month_end (default event_day; spec §8, §5.5): shared-cached view.
// one frozen cycle_table manifest per boundary (in its params) → policy action episodes × asset interval changes.
import {NextResponse} from 'next/server';
import {atStage,CycleStageFailure,cycleTableFacts} from '@/lib/macro/strategy/fact-views';
import {canCacheFacts,factView,memoKey,readMemoState} from '@/lib/macro/strategy/memo';
import {ParamError,memoHeaders,boundaryOf,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 try{
  const g=await atStage('read_gate',readGate);if(!g.ok)return g.res;
  const boundary=boundaryOf(readParams(new URL(req.url),['boundary']).get('boundary'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const {port}=g;
  const state=await atStage('read_state',()=>readMemoState(port));
  const db=strategyDb();
  const {value,outcome,source}=await atStage('fact_cache',()=>factView(canCacheFacts(state)?memoKey({kind:'cycle_table',params:{boundary},state,codeVersion}):'',state,
   ()=>cycleTableFacts({port,db,codeVersion,state,now:()=>new Date()},boundary),undefined,db));
  return await atStage('serialize_response',()=>NextResponse.json(value.view,{headers:memoHeaders(outcome,source)}));
 }catch(e){
  if(!(e instanceof ParamError))console.error('[macro-cycle-table]',{stage:e instanceof CycleStageFailure?e.stage:'request_setup'});
  return failureResponse(e);
 }
}
