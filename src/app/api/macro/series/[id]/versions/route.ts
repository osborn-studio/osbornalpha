// src/app/api/macro/series/[id]/versions/route.ts
// GET every ok version of one period of one series with its provenance (spec §3.2 evidence drawer, §3.3 revision
// history). Each version carries its retrieval receipt, evidence object, locator and transform; derived versions also
// list each input with the same fields. An unreadable input is reported as missing, never dropped. Session required;
// public reference data (anon RLS reads).
import {NextResponse} from 'next/server';
import {catalogById} from '@/lib/macro/catalog';
import {supabaseMacroDb,type MacroDb} from '@/lib/macro/db';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import type {ObservationRow} from '@/lib/macro/types';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {getAnonSupabase} from '@/lib/supabase/anon';
export const dynamic='force-dynamic';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'private, no-store'}});
async function provenance(db:Pick<MacroDb,'retrieval'|'evidenceObject'>,r:ObservationRow){
 const ret=r.retrieval_id?await db.retrieval(r.retrieval_id):null;
 const ev=ret?await db.evidenceObject(ret.sha256):null;
 return {observation_id:r.observation_id,series_id:r.series_id,version:r.version,value_text:r.value_text,available_at:r.available_at,availability_basis:r.availability_basis,
  retrieval:ret?{retrieval_id:ret.retrieval_id,fetch_url:ret.fetch_url,fetch_host:ret.fetch_host,http_status:ret.http_status,fetched_at:ret.fetched_at,tool_versions:ret.tool_versions}:null,
  evidence:ev?{sha256:ev.sha256,adapter:ev.adapter,content_type:ev.content_type,byte_length:ev.byte_length}:null,
  locator:r.locator,transform:r.transform,derived_from:r.derived_from};
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const def=catalogById(id);
 if(!def)return err('unknown_series','series is not in the catalog',404);
 const periodEnd=new URL(req.url).searchParams.get('period_end');
 if(!periodEnd||!DATE.test(periodEnd))return err('invalid_parameter:period_end','period_end must be YYYY-MM-DD',400);
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 try{
  const db=supabaseMacroDb({admin:getAdminSupabase(),anon:getAnonSupabase()});
  const readId=def.aliasOf??def.id;
  const rows=(await db.versionsOf(readId,periodEnd)).sort((a,b)=>b.version-a.version);
  const inputIds=[...new Set(rows.flatMap(r=>r.derived_from??[]))];
  const inputRows=inputIds.length?await db.observationsByIds(inputIds):[];
  const inputs=new Map(await Promise.all(inputRows.map(async r=>[r.observation_id,await provenance(db,r)] as const)));
  const versions=await Promise.all(rows.map(async r=>({...await provenance(db,r),inputs:(r.derived_from??[]).map(i=>inputs.get(i)??{observation_id:i,missing:true as const})})));
  return NextResponse.json({series_id:def.id,read_series_id:readId,period_end:periodEnd,versions},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch{return err('read_failed','provenance could not be read',503);}
}
