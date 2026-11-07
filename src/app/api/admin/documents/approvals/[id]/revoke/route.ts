// src/app/api/admin/documents/approvals/[id]/revoke/route.ts
// POST revoke an extraction approval (spec §4.7, §9): sets revoked_at; auto-decisions made under it
// stop being staged from then on (stage_candidate_publication answers approval_revoked and the
// candidate falls back to 'candidate'). The approval is the owner's act, so revoking it is the
// admin's too: same guards and audit as the insert route. Idempotent (a second revoke is a no-op).
import {requireAdminUser} from '@/lib/admin/auth';
import {adminFailure,auditBestEffort,json,jsonError,UUID_RE,writeGuard} from '@/lib/documents/candidates/admin-http';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {DocumentsDbError} from '@/lib/documents/types';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}

export async function POST(request:Request,{params}:Ctx){
 try{
  const user=await requireAdminUser();
  const guard=writeGuard(request);if(guard)return guard;
  const {id}=await params;
  if(!UUID_RE.test(id))return jsonError('invalid_id',400);
  const admin=getAdminSupabase();
  try{await supabaseDocumentsDb(admin).revokeApproval(id);}
  catch(e){if(e instanceof DocumentsDbError&&e.code==='not_found')return jsonError('not_found',404);throw e;}
  await auditBestEffort(admin,user.id,'document.approval_revoke',id,{approval_id:id});
  return json({approvalId:id,revoked:true});
 }catch(e){return adminFailure(e,'admin/documents/approvals/revoke');}
}
