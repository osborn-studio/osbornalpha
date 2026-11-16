// src/app/api/methodologies/[id]/[version]/route.ts
// GET /api/methodologies/[id]/[version] (spec §10): {row, doc_markdown, doc_sha256_matches,
// calibrations (latest per scope), recent_settlements}. The document is read from the deployment
// bundle (next.config outputFileTracingIncludes ships docs/methodologies/**) and checked against the
// registry's doc_sha256.
import {unitsOf} from '@/lib/judgments/calibrate';
import {publicReads,readMethodologyDoc} from '@/lib/judgments/public-reads';
import {METHOD_ID_RE,VERSION_RE,errorResponse,internalErrorResponse,okResponse} from '@/lib/judgments/route-utils';

export const dynamic='force-dynamic';
const RECENT=20;

export async function GET(_req:Request,{params}:{params:Promise<{id:string;version:string}>}){
 const {id,version}=await params;
 if(!METHOD_ID_RE.test(id))return errorResponse('invalid_parameter:id','invalid methodology id',400);
 if(!VERSION_RE.test(version))return errorResponse('invalid_parameter:version','invalid version',400);
 try{
  const r=publicReads();
  const row=(await r.db.listMethodologies()).find(m=>m.methodology_id===id&&m.version===version);
  if(!row)return errorResponse('unknown_methodology','no such methodology',404);
  const [doc,calibrations,recent]=await Promise.all([
   readMethodologyDoc(row.doc_path,row.doc_sha256),
   Promise.all(unitsOf(row).map(async u=>{const c=await r.db.latestCalibration(id,version,u.scope);return c?{scope:u.scope,row:c.row,valid:c.valid}:null;})),
   r.recentSettlements(id,version,RECENT)]);
  return okResponse({row,doc_markdown:doc.markdown,doc_sha256_matches:doc.sha256_matches,calibrations:calibrations.filter(c=>c!==null),recent_settlements:recent},{empty:false});
 }catch(e){return internalErrorResponse(e,'methodologies/id');}
}
