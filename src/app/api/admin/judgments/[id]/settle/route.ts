// src/app/api/admin/judgments/[id]/settle/route.ts
// POST (spec §9.5, §10): settle one judgment through settleNow, which claims via claimOne and
// fences every write with its lease. All outcomes are mapped explicitly; transport/auth failures
// and conflicting leases or requests never use a success response. Admin responses are no-store.
import {productionJudgmentDeps} from '@/lib/judgments/deps';
import type {SettleNowOutcome} from '@/lib/judgments/settle';
import {settleNow} from '@/lib/judgments/settle';
import {UUID_RE,adminBody,adminGate,codeVersionOf,errorCodeOf,errorResponse,internalErrorResponse,privateResponse} from '@/lib/judgments/route-utils';
import {audit} from '@/lib/research/store';
import type {ResearchSupabase} from '@/lib/research/store';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export const maxDuration=60;
const DEADLINE_MS=50_000;
const HTTP_OF_SETTLE:Record<SettleNowOutcome,number>={settled:200,void:200,duplicate:200,conflict:409,deferred:200,quarantined:200,quarantine_pending:200,leased:409,closed:200};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await adminGate(request,{write:true});
 if('response' in gate)return gate.response;
 try{
  const {id}=await params;
  if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
  const body=await adminBody(request,{reasonRequired:false});
  if(body instanceof Response)return body;
  const codeVersion=codeVersionOf();
  if(!codeVersion)return errorResponse('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
  let r;
  try{r=await settleNow(productionJudgmentDeps({codeVersion,actor:'script',triggeredBy:'manual',signal:AbortSignal.timeout(DEADLINE_MS)}),id,{actor:`admin:${gate.user.id}`,requestKey:`admin:${body.request_id}`});}
  catch(e){
   const code=errorCodeOf(e);
   if(code==='unknown_judgment')return errorResponse(code,'no such judgment',404);
   if(code==='settlement_sequence'||code==='lease_lost'||code==='request_key_conflict')return errorResponse(code,'judgment cannot be settled now',409);
   throw e;
  }
  try{await audit({supabase:getAdminSupabase() as unknown as ResearchSupabase,userId:gate.user.id},'judgments.settle',id,{id,reason:body.reason,request_id:body.request_id,outcome:r.outcome,seq:r.seq,detail:r.reason});}
  catch(e){console.error('[admin/judgments] audit failed',e instanceof Error?e.message:e);}
  if(r.outcome==='leased')return errorResponse('lease_lost','a settle run holds this judgment; retry later',409);
  if(r.outcome==='conflict')return errorResponse('request_key_conflict','request conflicts with an earlier one',409);
  return privateResponse({id,outcome:r.outcome,seq:r.seq},HTTP_OF_SETTLE[r.outcome]);
 }catch(e){return internalErrorResponse(e,'admin/judgments');}
}
