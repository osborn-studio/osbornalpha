// src/app/api/macro/strategy/reviews/route.ts
// GET /api/macro/strategy/reviews?region=US|CN (spec §8, §6.2): current review pointers of the last 36 months.
import {NextResponse} from 'next/server';
import {READ_HEADERS,failureResponse,readGate,readParams,regionOf,strategyDb,type ReviewIndexResponse} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
const MONTHS=36;

export async function GET(req:Request){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  const region=regionOf(readParams(new URL(req.url),['region']).get('region'));
  const rows=await strategyDb(g.session).reviewIndex(region,MONTHS);
  const body:ReviewIndexResponse={items:rows.map(r=>({region,...r}))};
  return NextResponse.json(body,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
