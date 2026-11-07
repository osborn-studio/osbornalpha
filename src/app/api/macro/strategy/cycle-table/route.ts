// src/app/api/macro/strategy/cycle-table/route.ts
// GET /api/macro/strategy/cycle-table?boundary=event_day|first_trading_day|month_end (default event_day; spec §8, §5.5): process-memoized view.
// one frozen cycle_table manifest per boundary (in its params) → policy action episodes × asset interval changes.
import {NextResponse} from 'next/server';
import {buildCycleTable,buildCycleTableManifest} from '@/lib/macro/strategy/cycle-table';
import {memoKey,readMemoState,strategyMemo} from '@/lib/macro/strategy/memo';
import {memoHeaders,boundaryOf,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const boundary=boundaryOf(readParams(new URL(req.url),['boundary']).get('boundary'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const state=await readMemoState(g.port);
  const compute=async()=>{
   const stored=await strategyDb(g.session).putManifest(await buildCycleTableManifest(g.port,{now:new Date(),codeVersion,boundary,snapshots:state.snapshots}));
   return {manifest_id:stored.manifest_id,view:buildCycleTable(stored)};
  };
  const replayable=state.snapshots.US!==null||state.snapshots.CN!==null;
  const {value,outcome}=replayable
   ?await strategyMemo.getOrCompute(memoKey({kind:'cycle_table',params:{boundary},state,codeVersion}),compute)
   :{value:await compute(),outcome:'miss' as const};
  return NextResponse.json(value.view,{headers:memoHeaders(outcome)});
 }catch(e){return failureResponse(e);}
}
