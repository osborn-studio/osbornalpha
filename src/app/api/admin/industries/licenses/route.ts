// src/app/api/admin/industries/licenses/route.ts
// POST /api/admin/industries/licenses {dataset_key, status, note} (spec §4.8, §9): the only licence
// switch. requireAdminUser(); JSON only; a browser-sent Origin must be ours (same defence as
// /api/admin/dq). The write goes through set_industry_dataset_license (IndustryDb.setDatasetLicense;
// service_role has no direct DML on industry_dataset_licenses), then research_audit_log, then
// revalidateTag('industries') so cached classification trees follow the switch (runbook: switch to
// internal FIRST, then revalidate; CDN residue ≤ one UTC day is accepted by spec §4.8). The licence is
// already committed when the audit runs, so an audit failure is logged instead of answering 500.
import {revalidateTag} from 'next/cache';
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseIndustryDb} from '@/lib/industry/db';
import {DATASET_KEYS,isLicensedStatus} from '@/lib/industry/licenses';
import type {DatasetKey} from '@/lib/industry/types';
import {audit,type ResearchSupabase} from '@/lib/research/store';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const NO_STORE={'Cache-Control':'no-store'};
const MAX_NOTE=500;

export async function POST(request:Request){
 try{
  const user=await requireAdminUser();
  if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return NextResponse.json({error:'unsupported_media_type'},{status:415,headers:NO_STORE});
  const origin=request.headers.get('origin');
  if(origin!==null&&origin!==new URL(request.url).origin)return NextResponse.json({error:'forbidden_origin'},{status:403,headers:NO_STORE});
  const body:unknown=await request.json().catch(()=>null);
  const b=(body??{}) as {dataset_key?:unknown;status?:unknown;note?:unknown};
  if(typeof b.dataset_key!=='string'||!(DATASET_KEYS as readonly string[]).includes(b.dataset_key))return NextResponse.json({error:'invalid_dataset_key'},{status:400,headers:NO_STORE});
  if(typeof b.status!=='string'||!isLicensedStatus(b.status))return NextResponse.json({error:'invalid_status'},{status:400,headers:NO_STORE});
  if(b.note!==undefined&&b.note!==null&&(typeof b.note!=='string'||b.note.length>MAX_NOTE))return NextResponse.json({error:'invalid_note'},{status:400,headers:NO_STORE});
  const key=b.dataset_key as DatasetKey,status=b.status,note=typeof b.note==='string'?b.note:null;
  const admin=getAdminSupabase();
  await supabaseIndustryDb(admin).setDatasetLicense(key,status,user.id,note);
  try{
   await audit({supabase:admin as unknown as ResearchSupabase,userId:user.id},'industry.license_set',key,{dataset_key:key,status,note});
  }catch(auditError){
   console.error('[admin/industries] audit failed',auditError instanceof Error?auditError.message:auditError);
  }
  revalidateTag('industries');
  return NextResponse.json({dataset_key:key,status},{headers:NO_STORE});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401,headers:NO_STORE});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403,headers:NO_STORE});
  console.error('[admin/industries/licenses]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'licence update unavailable'},{status:500,headers:NO_STORE});
 }
}
