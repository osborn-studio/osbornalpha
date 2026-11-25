import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {fixtureMode} from '@/lib/industry/fixture-mode';
import {authorizedVendorFixtures} from '@/lib/industry/vendor/page-deps';
import {supabaseTableClient} from '@/lib/db/table-client';
import {errorResponse,QueryError} from '@/lib/facts/public-route';
import {supabaseVendorRawStore} from '@/lib/vendor/raw-store';
import {readVendorAdmin,VendorNotFound} from '@/lib/industry/vendor/admin-read';
import {supabaseVendorIndustryDb} from '@/lib/industry/vendor/db';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
async function adminDeps(){
 if(fixtureMode()){
  const fixture=await authorizedVendorFixtures();
  if(!fixture)throw new AdminForbidden();
  return fixture;
 }
 await requireAdminUser();
 const admin=getAdminSupabase();
 return {db:supabaseVendorIndustryDb(admin),tables:supabaseTableClient(admin),raw:supabaseVendorRawStore(admin)};
}
export async function GET(request:Request){
 try{
  const data=await readVendorAdmin(new URL(request.url),await adminDeps());
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof AdminForbidden||e instanceof AdminUnauthenticated)
   return errorResponse('unlicensed','dataset vendor:gildata:industry-financials is not public',403);
  if(e instanceof VendorNotFound)return errorResponse('not_found','Observation not found',404);
  if(e instanceof QueryError)return errorResponse(e.message,'Invalid parameter',400);
  return errorResponse('read_failed','Vendor read failed',500);
 }
}
