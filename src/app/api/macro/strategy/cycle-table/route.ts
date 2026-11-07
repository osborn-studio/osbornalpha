// src/app/api/macro/strategy/cycle-table/route.ts
// GET /api/macro/strategy/cycle-table?boundary=event_day|first_trading_day|month_end (default event_day; spec §8, §5.5):
// one frozen cycle_table manifest per boundary (in its params) → policy action episodes × asset interval changes.
import {NextResponse} from 'next/server';
import {buildCycleTable,buildCycleTableManifest} from '@/lib/macro/strategy/cycle-table';
import {READ_HEADERS,boundaryOf,codeVersionOrNull,errorResponse,failureResponse,readGate,readParams,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const boundary=boundaryOf(readParams(new URL(req.url),['boundary']).get('boundary'));
  const codeVersion=codeVersionOrNull();
  if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const stored=await strategyDb(g.session).putManifest(await buildCycleTableManifest(g.port,{now:new Date(),codeVersion,boundary}));
  return NextResponse.json(buildCycleTable(stored),{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
