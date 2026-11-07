// src/app/api/admin/industries/runs/route.ts
// GET /api/admin/industries/runs?scheme= (spec §9): every aggregate and valuation run of the scheme
// (any status, newest generation first, coverage/reconciliation summaries and failure reasons), the
// licence rows and industry freshness. requireAdminUser() + service role; no licence gate.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {supabaseIndustryDb} from '@/lib/industry/db';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const NO_STORE={'Cache-Control':'no-store'};

export async function GET(request:Request){
 try{
  await requireAdminUser();
  const url=new URL(request.url);
  const all=url.searchParams.getAll('scheme');
  if(all.length!==1||(all[0]!=='sw2021'&&all[0]!=='sic'))return NextResponse.json({error:'invalid_parameter:scheme'},{status:400,headers:NO_STORE});
  const scheme=all[0];
  const admin=getAdminSupabase();
  const tables=supabaseTableClient(admin);
  const page={orderBy:'generation',desc:true,limit:100};
  const [metricRuns,valuationRuns,licenses,freshness]=await Promise.all([
   tables.select('industry_metric_runs',{scheme},page),
   tables.select('industry_valuation_runs',{scheme},page),
   tables.select('industry_dataset_licenses',{},{orderBy:'dataset_key',limit:100}),
   supabaseIndustryDb(admin).freshness(),
  ]);
  return NextResponse.json({scheme,metricRuns,valuationRuns,licenses,freshness},{headers:NO_STORE});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401,headers:NO_STORE});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403,headers:NO_STORE});
  console.error('[admin/industries/runs]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'industry runs unavailable'},{status:500,headers:NO_STORE});
 }
}
