// src/app/api/admin/evals/[run_id]/route.ts
// GET /api/admin/evals/[run_id] (spec §12): admin only; the whitelisted run row and ≤ 100 whitelisted
// dq_eval_case_results rows (src/lib/evals/admin.ts). run_id must be a UUID (400 invalid_run_id); an
// unknown run is 404 run_not_found. Same auth/error mapping as /api/admin/dq.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {EVAL_RUN_ID_RE,getEvalRun} from '@/lib/evals/admin';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export async function GET(_request:Request,{params}:{params:Promise<{run_id:string}>}){
 try{
  await requireAdminUser();
  const {run_id:raw}=await params;
  if(!EVAL_RUN_ID_RE.test(raw))return NextResponse.json({error:'invalid_run_id'},{status:400});
  const detail=await getEvalRun(supabaseTableClient(getAdminSupabase()),raw.toLowerCase());
  if(!detail)return NextResponse.json({error:'run_not_found'},{status:404});
  return NextResponse.json(detail,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403});
  console.error('[admin/evals/run]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'evals unavailable'},{status:500});
 }
}
