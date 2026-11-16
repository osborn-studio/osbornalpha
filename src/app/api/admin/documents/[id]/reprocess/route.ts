// src/app/api/admin/documents/[id]/reprocess/route.ts
// Admin reprocess (spec §9): requireAdminUser, JSON content type and same-origin check as
// /api/admin/dq/quarantine/[id]. body {stage:'extract'|'classify'}.
// extract → requestExtract (a version for the current EXTRACTOR_VERSION/TABLE_ALGO_VERSION already
//   exists → 409 revision_exists), then, when DOCUMENTS_EXTRACT_ENABLED is on (documentsFlag: '1'|'true') and a deployment SHA is
//   known, one runDocumentsExtract({documentIds:[id]}) right away; otherwise the document waits in
//   'stored' for the cron or scripts/documents/extract.ts (run.state 'skipped' with the reason).
// classify → classify() on the stored form_type/title/source_ref (listed sources only; uploads 409
//   not_classifiable) → reclassifyDocument with classifier_gen = CLASSIFIER_GEN.
// Audit 'document.reprocess' through research_audit_log after the change is committed; an audit
// failure is logged (the change stands). Responses private, no-store.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {audit} from '@/lib/research/store';
import type {ResearchSupabase} from '@/lib/research/store';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {classify} from '@/lib/documents/classify';
import {productionExtractDeps} from '@/lib/documents/extract/deps';
import {runDocumentsExtract} from '@/lib/documents/extract/run';
import {documentsFlag} from '@/lib/documents/flags';
import {CLASSIFIER_GEN,DocumentsDbError} from '@/lib/documents/types';
import type {DocumentRow} from '@/lib/documents/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEADLINE_MS=240_000;
const H={'Cache-Control':'private, no-store'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:H});
type Run={state:'extracted'|'no_text_layer'|'failed'|'skipped';code?:string;extractionId?:string};
/** Setup failures of the extraction runner (nothing was claimed): reported as 503 with the code, never as a skip. */
const SETUP_CODES=new Set(['worker_missing','worker_stale']);

async function extractNow(admin:ReturnType<typeof getAdminSupabase>,id:string):Promise<Run>{
 if(!documentsFlag('DOCUMENTS_EXTRACT_ENABLED'))return {state:'skipped',code:'extract_disabled'};
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return {state:'skipped',code:'code_version_unavailable'};
 try{
  const r=await runDocumentsExtract(productionExtractDeps({deadline:new Date(Date.now()+DEADLINE_MS),codeVersion,admin}),{limit:1,documentIds:[id],dryRun:false,triggeredBy:'manual'});
  const d=r.documents[0];
  const setup=r.documents.length===0&&r.status==='failed'?r.errors.find(e=>SETUP_CODES.has(e.code)):undefined;
  if(setup)return {state:'failed',code:setup.code};
  if(!d)return {state:'skipped',code:'not_due'};
  return d.outcome==='extracted'||d.outcome==='no_text_layer'?{state:d.outcome,extractionId:d.extractionId}:{state:d.outcome==='failed'?'failed':'skipped',code:d.code};
 }catch(e){
  console.error('[admin/documents/reprocess] extract',e instanceof Error?e.message:e);
  return {state:'failed',code:'extract_failed'};
 }
}

function classifyPatch(row:DocumentRow){
 if(row.source==='upload')return null;
 const c=classify(row.source,{form_type:row.form_type??undefined,title:row.title,headline:row.form_type??undefined,source_ref:row.source_ref});
 return {doc_class:c.doc_class,classifier_gen:CLASSIFIER_GEN,fiscal_year:c.fiscal_year,fiscal_period:c.fiscal_period,period_end:c.period_end,filing_source_ref:c.filing_source_ref};
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireAdminUser();
  if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return json({error:'unsupported_media_type'},415);
  const origin=request.headers.get('origin');
  if(origin!==null&&origin!==new URL(request.url).origin)return json({error:'forbidden_origin'},403);
  const {id}=await params;
  if(!UUID_RE.test(id))return json({error:'invalid_id'},400);
  const body:unknown=await request.json().catch(()=>null);
  const stage=(body as {stage?:unknown}|null)?.stage;
  if(stage!=='extract'&&stage!=='classify')return json({error:'invalid_stage'},400);
  const admin=getAdminSupabase();
  const db=supabaseDocumentsDb(admin);
  const row=await db.documentById(id);
  if(!row)return json({id,error:'not_found'},404);
  let result:Record<string,unknown>;
  if(stage==='classify'){
   const patch=classifyPatch(row);
   if(!patch)return json({id,error:'not_classifiable'},409);
   await db.reclassifyDocument(id,patch,user.id);
   result={id,stage,patch};
  }else{
   try{await db.requestExtract(id,user.id);}
   catch(e){if(e instanceof DocumentsDbError&&e.code==='revision_exists')return json({id,error:'revision_exists'},409);throw e;}
   result={id,stage,run:await extractNow(admin,id)};
  }
  try{await audit({supabase:admin as unknown as ResearchSupabase,userId:user.id},'document.reprocess',id,result);}
  catch(auditError){console.error('[admin/documents/reprocess] audit failed',auditError instanceof Error?auditError.message:auditError);}
  const run=result.run as Run|undefined;
  if(run?.state==='failed'&&run.code!==undefined&&SETUP_CODES.has(run.code))return json({...result,error:run.code},503);   // the document was reset; the runner could not start
  return json(result);
 }catch(error){
  if(error instanceof AdminUnauthenticated)return json({error:'authentication required'},401);
  if(error instanceof AdminForbidden)return json({error:'admin role required'},403);
  console.error('[admin/documents/reprocess]',error instanceof Error?error.message:error);
  return json({error:'reprocess unavailable'},500);
 }
}
