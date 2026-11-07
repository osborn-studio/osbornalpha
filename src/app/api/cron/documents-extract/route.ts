// src/app/api/cron/documents-extract/route.ts
// Extraction trigger (spec §6.3, §7.3): CRON_SECRET bearer (same check as facts-sync; missing secret
// → 503), limit 1..100 (default 10), maxDuration 300 with a 240 s deadline handed to the core (no
// new document under 90 s left → deadline_hit). Gated: DOCUMENTS_EXTRACT_ENABLED must be '1'|'true' (documentsFlag), else after auth
// 200 {skipped:'disabled'} with no side effects (spec §12 degradation: until the Vercel pdf.js smoke passes, extraction runs
// only through scripts/documents/extract.ts). A missing VERCEL_GIT_COMMIT_SHA refuses the run (503).
// The HTTP receipt carries codes, keys and counts only, never error messages.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {productionExtractDeps} from '@/lib/documents/extract/deps';
import {runDocumentsExtract} from '@/lib/documents/extract/run';
import {documentsFlag} from '@/lib/documents/flags';
import type {ExtractReceipt} from '@/lib/documents/extract/run';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=10,MAX_LIMIT=100;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function publicReceipt(r:ExtractReceipt){
 return {batchId:r.batchId,status:r.status,counts:r.counts,idle:r.idle,
  errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),
  documents:r.documents.map(d=>({documentId:d.documentId,outcome:d.outcome,code:d.code,pageCount:d.pageCount,extractionId:d.extractionId}))};
}
function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 if(!documentsFlag('DOCUMENTS_EXTRACT_ENABLED'))return NextResponse.json({skipped:'disabled'},{status:200,headers:{'Cache-Control':'no-store'}});   // after auth, before any parameter work, deps or DB
 const url=new URL(request.url);
 const limits=url.searchParams.getAll('limit');
 if(limits.length>1)return err('invalid_parameter:limit','limit may be given once',400);
 let limit=DEFAULT_LIMIT;
 if(limits.length===1){const v=limits[0];if(!/^\d{1,3}$/.test(v)||Number(v)<1||Number(v)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(v);}
  const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const receipt=await runDocumentsExtract(productionExtractDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion}),{limit,dryRun:false,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  console.error('[cron/documents-extract]',e instanceof Error?e.message:e);
  return err('extract_failed','Document extraction failed',500);
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
