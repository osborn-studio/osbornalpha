// src/app/api/admin/documents/candidates/[id]/route.ts
// POST human decision on one candidate (spec §9): {status:'confirmed'|'rejected'|'candidate'} →
// decideCandidate(human) (not_eligible / decided → 409; the SQL function is the authority on the
// allowed transitions and on checks_passed). Idempotent: a candidate already in the requested state
// (confirmed also matches promoted) is not decided again. After a confirm the issuer is promoted
// once right away (promoteIssuerNow, own batch); a failure there is reported in `run` and left to
// the candidates cron. Audited as document.candidate_decide.
import {requireAdminUser} from '@/lib/admin/auth';
import {adminFailure,auditBestEffort,json,jsonError,UUID_RE,writeGuard} from '@/lib/documents/candidates/admin-http';
import {supabaseCandidatesDeps} from '@/lib/documents/candidates/run';
import {promoteIssuerNow} from '@/lib/documents/hk-facts/promote';
import {DocumentsDbError} from '@/lib/documents/types';
import type {CandidateStatus} from '@/lib/documents/types';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
const DECISIONS=['confirmed','rejected','candidate'] as const;
type Decision=typeof DECISIONS[number];
const DEADLINE_MS=240_000;

export async function POST(request:Request,{params}:Ctx){
 try{
  const user=await requireAdminUser();
  const guard=writeGuard(request);if(guard)return guard;
  const {id}=await params;
  if(!UUID_RE.test(id))return jsonError('invalid_id',400);
  const body:unknown=await request.json().catch(()=>null);
  const status=(body as {status?:unknown}|null)?.status;
  if(typeof status!=='string'||!DECISIONS.includes(status as Decision))return jsonError('invalid_status',400);
  const admin=getAdminSupabase();
  const deps=supabaseCandidatesDeps(admin,{deadline:new Date(Date.now()+DEADLINE_MS),codeVersion:resolveCodeVersion({allowGit:false})});
  const current=await deps.db.candidateById(id);
  if(!current)return jsonError('not_found',404);
  const unchanged=current.status===status||(status==='confirmed'&&current.status==='promoted');
  let result:{status:CandidateStatus};
  if(unchanged)result={status:current.status};
  else{
   try{result=await deps.db.decideCandidate(id,{kind:'human',decided_by:user.id,status:status as Decision});}
   catch(e){
    if(e instanceof DocumentsDbError&&(e.code==='not_eligible'||e.code==='decided'))return jsonError(e.code,409);
    if(e instanceof DocumentsDbError&&e.code==='not_found')return jsonError('not_found',404);
    throw e;
   }
   await auditBestEffort(admin,user.id,'document.candidate_decide',id,{status,previous:current.status});
  }
  let run:{state:'published'|'failed'|'skipped';message?:string}={state:'skipped',message:unchanged?'unchanged':'not_confirmed'};
  if(status==='confirmed'){
   const doc=await deps.db.documentById(current.document_id);
   if(!doc?.issuer_id)run={state:'skipped',message:'no_issuer'};
   else{
    try{const r=await promoteIssuerNow(deps,doc.issuer_id,'manual');run=r.message===undefined?{state:r.state}:{state:r.state,message:r.message};}
    catch(e){console.error('[admin/documents] promote',e instanceof Error?e.message:e);run={state:'failed',message:'promote_error'};}
   }
  }
  return json({id,status:result.status,run});
 }catch(e){return adminFailure(e,'admin/documents/candidates');}
}
