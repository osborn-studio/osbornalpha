import {errorResponse,QueryError} from '@/lib/facts/public-route';
import {readVendorAdmin,VendorNotFound} from '@/lib/industry/vendor/admin-read';
import {vendorPageDeps} from '@/lib/industry/vendor/page-deps';
import {vendorPageLicence} from '@/lib/industry/vendor/page-read';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const deps=await vendorPageDeps();
  if(await vendorPageLicence(deps)==='withheld')
   return errorResponse('unlicensed','dataset vendor:gildata:industry-financials is not public',403);
  const url=new URL(request.url);
  if(url.searchParams.has('view'))throw new QueryError('view');
  url.searchParams.set('view','replay');
  const data=await readVendorAdmin(url,deps);
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof VendorNotFound)return errorResponse('not_found','Observation not found',404);
  if(e instanceof QueryError)return errorResponse(e.message,'Invalid parameter',400);
  return errorResponse('read_failed','Vendor read failed',500);
 }
}
