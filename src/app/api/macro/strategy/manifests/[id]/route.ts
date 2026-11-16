// src/app/api/macro/strategy/manifests/[id]/route.ts
// GET /api/macro/strategy/manifests/<uuid> (spec §8, §4.5): the full stored manifest (public reference data).
import {NextResponse} from 'next/server';
import {READ_HEADERS,errorResponse,failureResponse,readGate,readParams,strategyDb,uuidOf} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const g=await readGate();if(!g.ok)return g.res;
 try{
  readParams(new URL(req.url),[]);
  const id=uuidOf((await params).id,'id');
  const stored=await strategyDb(g.session).manifest(id);
  if(!stored)return errorResponse('manifest_not_found','no such manifest',404);
  return NextResponse.json(stored,{headers:READ_HEADERS});
 }catch(e){return failureResponse(e);}
}
