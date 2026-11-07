// src/app/api/macro/evidence/[sha256]/route.ts
// GET /api/macro/evidence/[sha256] (spec §3.2 drawer, §8): evidence object metadata, every retrieval
// receipt of those bytes, and a 60-second signed download URL from the private macro-raw bucket.
import {CATALOG_VERSION} from '@/lib/macro/catalog';
import {SHA256_RE,SIGNED_URL_SECONDS,errorResponse,failureResponse,macroRouteDeps,okJson,requireSessionUser} from '@/lib/macro/route-helpers';

export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{sha256:string}>}){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 const {sha256}=await params;
 if(!SHA256_RE.test(sha256))return errorResponse('invalid_parameter:sha256','invalid sha256',400);
 try{
  const deps=macroRouteDeps();
  const obj=await deps.db.evidenceObject(sha256);
  if(!obj)return errorResponse('not_found','evidence not found',404);
  const [retrievals,url]=await Promise.all([deps.db.retrievalsOf(sha256),deps.signedUrl(obj.object_path,SIGNED_URL_SECONDS)]);
  return okJson({catalogVersion:CATALOG_VERSION,evidence:obj,retrievals,download:{url,expiresIn:SIGNED_URL_SECONDS}});
 }catch(e){return failureResponse(e,'macro-evidence');}
}
