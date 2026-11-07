// src/app/api/macro/analyses/[runId]/route.ts
// GET one saved analysis run (spec §8). A session is required. The read goes through the user's server client, so
// RLS (user_id = auth.uid()) hides other users' runs → 404. Never cached.
import {NextResponse} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {UUID_RE,requireSessionUser} from '@/lib/macro/route-helpers';
import {getServerSupabase} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
const HEADERS={'Cache-Control':'private, no-store'};
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:HEADERS});
export async function GET(_req:Request,{params}:{params:Promise<{runId:string}>}){
 const {runId}=await params;
 if(!UUID_RE.test(runId))return err('invalid_parameter:runId','runId must be a uuid',400);
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 const supabase=await getServerSupabase();   // the user's own client: RLS user_id = auth.uid()
 const {data,error}=await (supabase as unknown as SupabaseClient).from('macro_analysis_runs')
  .select('run_id,request_id,kind,spec,inputs,inputs_hash,results,code_version,method_version,status,error,created_at').eq('run_id',runId).maybeSingle();
 if(error)return err('read_failed','analysis run could not be read',503);
 if(!data)return err('not_found','no such run',404);
 return NextResponse.json({run:data},{headers:HEADERS});
}
