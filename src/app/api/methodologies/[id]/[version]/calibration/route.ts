// src/app/api/methodologies/[id]/[version]/calibration/route.ts
// GET …/calibration (spec §10): the latest calibration row of one scope with its reliability bins
// and temporal split; sample=1 adds the cohort entries, read from the private bucket server-side
// (service role) only after the anon read returned the row — i.e. only for a published method.
import {publicReads,readCohortSample} from '@/lib/judgments/public-reads';
import {METHOD_ID_RE,ParamError,VERSION_RE,enumParam,errorResponse,flagParam,internalErrorResponse,okResponse,paramErrorResponse,readParams} from '@/lib/judgments/route-utils';
import type {CalibrationScope,ScopeType} from '@/lib/judgments/types';

export const dynamic='force-dynamic';
const PARAMS=['scope_type','scope_key','sample'] as const;
const SCOPE_TYPES:readonly ScopeType[]=['all','market','subject_type'];

export async function GET(req:Request,{params}:{params:Promise<{id:string;version:string}>}){
 const {id,version}=await params;
 if(!METHOD_ID_RE.test(id))return errorResponse('invalid_parameter:id','invalid methodology id',400);
 if(!VERSION_RE.test(version))return errorResponse('invalid_parameter:version','invalid version',400);
 let scope:CalibrationScope,sample:boolean;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const type=enumParam(p,'scope_type',SCOPE_TYPES)??'all';
  const key=p.get('scope_key')??'';
  if(type==='all'?key!=='':!/^[A-Za-z_]{1,32}$/.test(key))throw new ParamError('scope_key');
  scope={scope_type:type,scope_key:key};sample=flagParam(p,'sample');
 }catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'methodologies/calibration');}
 try{
  const r=publicReads();
  const row=(await r.db.listMethodologies()).find(m=>m.methodology_id===id&&m.version===version);
  if(!row)return errorResponse('unknown_methodology','no such methodology',404);
  const c=await r.db.latestCalibration(id,version,scope);
  if(!c)return okResponse({scope,calibration:null,valid:false,state:'insufficient',reliability:[],temporal_split:null,sample:null,sample_status:null},{empty:true});
  const s=sample?await readCohortSample(c.row.cohort_path,c.row.cohort_sha256):null;
  const metrics=c.row.metrics as Record<string,unknown>;
  return okResponse({scope,calibration:c.row,valid:c.valid,state:c.valid?c.row.state:'insufficient',reliability:c.row.reliability,temporal_split:metrics.temporal_split??null,
   sample:s?.entries??null,sample_status:s?.status??null},{empty:false});
 }catch(e){return internalErrorResponse(e,'methodologies/calibration');}
}
