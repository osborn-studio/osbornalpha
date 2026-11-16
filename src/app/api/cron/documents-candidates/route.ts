// src/app/api/cron/documents-candidates/route.ts
// Candidates / auto-decide / HK promotion trigger (spec §6.3, §7.3): CRON_SECRET bearer (same
// check as facts-sync), limit 1..200 (default 25), maxDuration 300 with a 240 s deadline handed to
// runDocumentsCandidates, which stops starting extractions / issuers when < 90 s / 60 s remain.
// Gated by documentsFlag('DOCUMENTS_CANDIDATES_ENABLED'): off → after auth 200 {skipped:'disabled'}, no side effects
// (spec §12 degraded path — until the Vercel pdfjs smoke passes, candidates run only from local scripts).
// A missing VERCEL_GIT_COMMIT_SHA refuses the run. The HTTP receipt carries codes, keys and counts;
// never messages.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {CandidatesRunError,runDocumentsCandidates,supabaseCandidatesDeps} from '@/lib/documents/candidates/run';
import type {CandidatesReceipt} from '@/lib/documents/candidates/run';
import {documentsFlag} from '@/lib/documents/flags';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=25,MAX_LIMIT=200;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function publicReceipt(r:CandidatesReceipt){
 const errs=(list:{code:string;key?:string}[])=>list.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key});
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:errs(r.errors),idle:r.idle,auto:r.auto,
  extractions:r.extractions.map(e=>({extractionId:e.extractionId,outcome:e.outcome,code:e.code,inserted:e.inserted,written:e.written,inherited:e.inherited,quarantined:e.quarantined})),
  promote:r.promote.map(p=>({issuerId:p.issuerId,outcome:p.outcome,code:p.code,counts:p.counts,errors:errs((p as {errors?:{code:string;key?:string}[]}).errors??[])}))};
}
function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 if(!documentsFlag('DOCUMENTS_CANDIDATES_ENABLED'))return NextResponse.json({skipped:'disabled'},{status:200,headers:{'Cache-Control':'no-store'}});   // after auth, before any parameter work, deps or DB
 const url=new URL(request.url);
 if(url.searchParams.getAll('limit').length>1)return err('invalid_parameter:limit','limit may be given once',400);
 const limitRaw=url.searchParams.get('limit');
 let limit=DEFAULT_LIMIT;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=supabaseCandidatesDeps(getAdminSupabase(),{deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runDocumentsCandidates(deps,{limit,dryRun:false,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof CandidatesRunError?e.code:'candidates_failed','Documents candidates run failed',500);
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
