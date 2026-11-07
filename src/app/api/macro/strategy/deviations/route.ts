// src/app/api/macro/strategy/deviations/route.ts
// GET /api/macro/strategy/deviations?region=US|CN (spec §8, §6.4, §9.1): the only pure judgment route. Judgment layer
// off → 404 judgments_disabled (F4 is never called); any F4 failure → 503 judgments_unavailable.
import {NextResponse} from 'next/server';
import type {Region} from '@/lib/macro/strategy/contract';
import {listDeviationCases} from '@/lib/macro/strategy/deviations';
import {createF4Client} from '@/lib/macro/strategy/f4-client';
import {judgmentsEnabled} from '@/lib/macro/strategy/flags';
import {READ_HEADERS,errorResponse,failureResponse,readGate,readParams,regionOf,type DeviationsResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 let region:Region;
 try{region=regionOf(readParams(new URL(req.url),['region']).get('region'));}catch(e){return failureResponse(e);}
 if(!judgmentsEnabled())return errorResponse('judgments_disabled','the judgment layer is off',404);
 try{
  const r=await listDeviationCases(createF4Client(),region);
  const body:DeviationsResponse={cases:r.cases,incomplete:r.incomplete};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch{return errorResponse('judgments_unavailable','the judgment layer is unavailable',503);}
}
