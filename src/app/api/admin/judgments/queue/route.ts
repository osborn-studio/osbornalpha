// src/app/api/admin/judgments/queue/route.ts
// GET (spec §9.5 /admin/judgments): settle-queue rows for the admin page — filter due | backoff |
// leased | all (default due), limit 1..500 (default 100), keyset `after` (judgment_id). Each row is
// joined with its judgment summary and latest settlement (Task 21 api-types QueueItem); `counts` are
// the due / backoff / leased sizes capped at QUEUE_LIST_MAX (500); `now` is the database clock.
// Admin only, service role, never cached.
import {supabaseJudgmentsDb} from '@/lib/judgments/db';
import {adminGate,enumParam,intParam,internalErrorResponse,paramErrorResponse,privateResponse,readParams,uuidParam} from '@/lib/judgments/route-utils';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';

export const dynamic='force-dynamic';
const FILTERS=['due','backoff','leased','all'] as const;

export async function GET(request:Request){
 const gate=await adminGate(request,{write:false});
 if('response' in gate)return gate.response;
 let q;
 try{const p=readParams(new URL(request.url),['filter','limit','after']);q={filter:enumParam(p,'filter',FILTERS)??'due',limit:intParam(p,'limit',100,500),after:uuidParam(p,'after')};}
 catch(e){return paramErrorResponse(e)??internalErrorResponse(e,'admin/judgments/queue');}
 try{
  const db=supabaseJudgmentsDb({anon:getAnonSupabase(),admin:getAdminSupabase()});
  const [rows,now,due,backoff,leased]=await Promise.all([db.queueList({filter:q.filter,limit:q.limit,after:q.after}),db.serverTime(),
   ...(['due','backoff','leased'] as const).map(f=>db.queueList({filter:f,limit:500}))]);
  const ids=rows.map(r=>r.judgment_id);
  const [judgments,settlements]=await Promise.all([Promise.all(ids.map(id=>db.getJudgment(id))),ids.length?db.settlementsOf(ids):Promise.resolve([])]);
  const latest=new Map<string,{seq:number;kind:string;outcome:'hit'|'miss'|null;settled_at:string}>();
  for(const x of settlements){const cur=latest.get(x.judgment_id);if(!cur||x.seq>cur.seq)latest.set(x.judgment_id,{seq:x.seq,kind:x.kind,outcome:x.outcome,settled_at:x.settled_at});}
  const items=rows.map((r,i)=>{
   const j=judgments[i];const l=latest.get(r.judgment_id);
   return {...r,judgment:j?{subject_type:j.subject_type,subject_key:j.subject_key,methodology_id:j.methodology_id,methodology_version:j.methodology_version,target:j.target}:null,
    latest_settlement:l?{kind:l.kind,outcome:l.outcome,settled_at:l.settled_at}:null};
  });
  return privateResponse({filter:q.filter,rows:items,next_after:rows.length>0?rows[rows.length-1].judgment_id:null,counts:{due:due.length,backoff:backoff.length,leased:leased.length},now});
 }catch(e){return internalErrorResponse(e,'admin/judgments/queue');}
}
