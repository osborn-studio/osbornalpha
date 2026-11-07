// src/app/api/admin/evals/route.ts
// GET /api/admin/evals?limit=&module=&kind= (spec §12): admin only; whitelisted run rows newest first plus
// the 30-day gate-failing count (src/lib/evals/admin.ts). Same auth/error mapping as /api/admin/dq.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {listEvalRuns,parseEvalListQuery} from '@/lib/evals/admin';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  await requireAdminUser();
  const parsed=parseEvalListQuery(new URL(request.url).searchParams);
  if(!parsed.ok)return NextResponse.json({error:parsed.error},{status:400});
  const tables=supabaseTableClient(getAdminSupabase());
  return NextResponse.json(await listEvalRuns(tables,parsed.query,new Date()),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403});
  console.error('[admin/evals]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'evals unavailable'},{status:500});
 }
}
