// src/app/api/judgments/[id]/route.ts
// GET /api/judgments/[id] (spec §10): {card, judgment, settlements, calibration}. The envelope comes from
// envelopeById (RPC judgment_envelope_by_id through anon: RLS publishes published methods only; the
// judgment_history view semantics, so as_known applies the SQL cutoff rules to the judgment, settlement,
// calibration and method state alike) — no history scan, so a deep history or a small server cap can never
// 404 a published judgment (plan audit P2-01); settlements are the full public list (paged until empty), cut
// at the same cutoff.
import {judgmentDetailPayload} from '@/lib/judgments/detail-payload';
import {publicReads} from '@/lib/judgments/public-reads';
import {UUID_RE,errorResponse,internalErrorResponse,okResponse,paramErrorResponse,readParams,viewParams} from '@/lib/judgments/route-utils';

export const dynamic='force-dynamic';
const PARAMS=['view','asOf'] as const;

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();const today=now.toISOString().slice(0,10);
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 let v;
 try{v=viewParams(readParams(new URL(req.url),PARAMS),today);}catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'judgments/id');}
 try{
  const r=publicReads();
  const payload=await judgmentDetailPayload(r,id,v,now.toISOString());
  if(!payload)return errorResponse('unknown_judgment','no such judgment at this view',404);
  return okResponse(payload,{empty:false});
 }catch(e){return internalErrorResponse(e,'judgments/id');}
}
