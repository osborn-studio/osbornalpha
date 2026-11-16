// src/app/api/judgments/[id]/history/route.ts
// GET /api/judgments/[id]/history (spec §10): the same subject × type × method, as_of descending,
// keyset by `before` (a judgment_id from the previous page), limit 1..500 (default 50).
import {cardsOf,methodKey} from '@/lib/judgments/display';
import {publicReads} from '@/lib/judgments/public-reads';
import {UUID_RE,errorResponse,intParam,internalErrorResponse,okResponse,paramErrorResponse,readParams,uuidParam} from '@/lib/judgments/route-utils';

export const dynamic='force-dynamic';
const PARAMS=['limit','before'] as const;

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const now=new Date();
 const {id}=await params;
 if(!UUID_RE.test(id))return errorResponse('invalid_parameter:id','invalid id',400);
 let q;
 try{const p=readParams(new URL(req.url),PARAMS);q={limit:intParam(p,'limit',50,500),before:uuidParam(p,'before')};}
 catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'judgments/history');}
 try{
  const r=publicReads();
  const loc=await r.judgmentLocator(id);
  if(!loc)return errorResponse('unknown_judgment','no such judgment',404);
  const [envs,methods]=await Promise.all([
   r.db.historyOf({type:loc.subject_type,key:loc.subject_key},loc.judgment_type,{id:loc.methodology_id,version:loc.methodology_version},{view:'latest',before:q.before,limit:q.limit}),
   r.db.listMethodologies()]);
  const cards=cardsOf(envs,new Map(methods.map(m=>[methodKey(m),m])),{includeAbstained:true,now:now.toISOString()});
  return okResponse({judgment_id:id,cards,next_before:envs.length>0?envs[envs.length-1].judgment.judgment_id:null},{empty:cards.length===0});
 }catch(e){return internalErrorResponse(e,'judgments/history');}
}
