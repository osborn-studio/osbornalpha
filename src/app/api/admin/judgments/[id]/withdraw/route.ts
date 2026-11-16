// src/app/api/admin/judgments/[id]/withdraw/route.ts
// POST (spec §9.5, §10): admin settled → withdrawn. Body {reason (required), request_id (uuid)};
// requireAdminUser, JSON + same-origin, research_audit_log via the shared audit helper (an audit
// failure is logged, not turned into a 500 that would invite a retry). 409 settlement_sequence on an
// illegal transition, request_key_conflict on a reused request_id with a different payload.
import {appendAdminSettlement,HTTP_OF} from '@/lib/judgments/admin-actions';
import {supabaseJudgmentsDb} from '@/lib/judgments/db';
import {UUID_RE,adminBody,adminGate,codeVersionOf,errorResponse,internalErrorResponse,privateResponse} from '@/lib/judgments/route-utils';
import {supabaseTableClient} from '@/lib/db/table-client';
import {audit} from '@/lib/research/store';
import type {ResearchSupabase} from '@/lib/research/store';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';

export const dynamic='force-dynamic';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const gate=await adminGate(request,{write:true});
 if('response' in gate)return gate.response;
 try{
  const {id}=await params;
  if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
  const body=await adminBody(request,{reasonRequired:true});
  if(body instanceof Response)return body;
  const codeVersion=codeVersionOf();
  if(!codeVersion)return errorResponse('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
  const admin=getAdminSupabase();
  const r=await appendAdminSettlement({db:supabaseJudgmentsDb({anon:getAnonSupabase(),admin}),tables:supabaseTableClient(admin),judgmentId:id,kind:'withdrawn',reason:body.reason!,requestId:body.request_id,adminId:gate.user.id,codeVersion});
  if(r.outcome==='applied'||r.outcome==='already_applied'){
   try{await audit({supabase:admin as unknown as ResearchSupabase,userId:gate.user.id},'judgments.withdraw',id,{id,kind:'withdrawn',reason:body.reason,request_id:body.request_id,outcome:r.outcome,seq:r.seq,batch_id:r.batchId});}
   catch(e){console.error('[admin/judgments] audit failed',e instanceof Error?e.message:e);}
  }
  if(r.outcome==='unknown_judgment')return errorResponse('unknown_judgment','no such judgment',404);
  if(r.outcome==='applied'||r.outcome==='already_applied')return privateResponse({id,outcome:r.outcome,seq:r.seq});
  return errorResponse(r.outcome,r.outcome==='settlement_sequence'?'transition not allowed':'request conflicts with an earlier one',HTTP_OF[r.outcome]);
 }catch(e){return internalErrorResponse(e,'admin/judgments');}
}
