import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {errorResponse,QueryError} from '@/lib/facts/public-route';
import {readVendorAdmin} from '@/lib/industry/vendor/admin-read';
import {supabaseVendorIndustryDb} from '@/lib/industry/vendor/db';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  await requireAdminUser();
  const admin=getAdminSupabase();
  const data=await readVendorAdmin(new URL(request.url),{db:supabaseVendorIndustryDb(admin),tables:supabaseTableClient(admin)});
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof AdminForbidden||e instanceof AdminUnauthenticated)
   return errorResponse('unlicensed','dataset vendor:gildata:industry-financials is not public',403);
  if(e instanceof QueryError)return errorResponse(e.message,'Invalid parameter',400);
  return errorResponse('read_failed','Vendor read failed',500);
 }
}
