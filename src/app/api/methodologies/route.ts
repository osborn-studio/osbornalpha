// src/app/api/methodologies/route.ts
// GET /api/methodologies (spec §10): registry rows (method metadata is public, spec §5.6) with the
// latest scope='all' calibration summary; an unpublished method's calibration is invisible to anon
// (RLS) and reads as null.
import {publicReads} from '@/lib/judgments/public-reads';
import {enumParam,internalErrorResponse,okResponse,paramErrorResponse,readParams} from '@/lib/judgments/route-utils';
import type {MethodologyStatus} from '@/lib/judgments/types';

export const dynamic='force-dynamic';
const STATUSES:readonly MethodologyStatus[]=['draft','active','retired'];

export async function GET(req:Request){
 let status:MethodologyStatus|undefined;
 try{status=enumParam(readParams(new URL(req.url),['status']),'status',STATUSES);}catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'methodologies');}
 try{
  const r=publicReads();
  const rows=await r.db.listMethodologies(status);
  const methodologies=await Promise.all(rows.map(async row=>{
   const c=await r.db.latestCalibration(row.methodology_id,row.version,{scope_type:'all',scope_key:''});
   return {methodology:row,calibration:c?{state:c.valid?c.row.state:'insufficient',valid:c.valid,n_independent:c.row.n_independent,threshold_n:c.row.threshold_n,computed_at:c.row.computed_at,valid_until:c.row.valid_until,metrics:c.row.metrics}:null};
  }));
  return okResponse({status:status??null,methodologies},{empty:methodologies.length===0});
 }catch(e){return internalErrorResponse(e,'methodologies');}
}
