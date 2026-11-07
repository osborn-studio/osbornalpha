// src/app/api/cron/industry-sync/route.ts
// Industry job trigger (spec §9, §10): CRON_SECRET bearer (same constant-time check as facts-sync),
// job=<one of INDUSTRY_JOBS> exactly once, optional limit 1..500. official/valuation answer 200
// {skipped:'deferred_i3'}. Gates (jobs.ts::jobGate): Tushare jobs without TUSHARE_TOKEN → 503
// tushare_unavailable; facts-scope / aggregate without their CN flags → 403 job_disabled (owner
// default E: they are not in vercel.json either). A missing code_version refuses the run. The HTTP
// receipt carries codes and counts only (no error messages). Only memberships-sic is scheduled
// (vercel.json, daily 02:00 UTC, limit 200; spec §18 #69); everything else is a script until the owner enables it.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {DEFERRED_JOBS,isIndustryJob,jobGate,productionIndustryDeps,runIndustryJob} from '@/lib/industry/jobs';
import type {RunnerReceipt} from '@/lib/industry/jobs';
import {IndustryDbError} from '@/lib/industry/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const MAX_LIMIT=500;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
const publicReceipt=(r:RunnerReceipt)=>({batchId:r.batchId,status:r.status,counts:r.counts,errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key})});

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 if(url.searchParams.getAll('job').length!==1)return err('invalid_parameter:job','job required once',400);
 const job=url.searchParams.get('job')!;
 if(!isIndustryJob(job))return err('invalid_parameter:job','unknown job',400);
 if(url.searchParams.getAll('limit').length>1)return err('invalid_parameter:limit','limit may be given once',400);
 const limitRaw=url.searchParams.get('limit');
 let limit:number|undefined;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 const started=new Date();
 if(DEFERRED_JOBS.has(job))return NextResponse.json({ok:true,job,skipped:'deferred_i3',started_at:started.toISOString()},{headers:{'Cache-Control':'no-store'}});
 const gate=jobGate(job,process.env,{apply:true});
 if(gate)return err(gate.code,gate.message,gate.code==='tushare_unavailable'?503:403);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 try{
  const result=await runIndustryJob(job,productionIndustryDeps({codeVersion}),{dryRun:false,triggeredBy:'cron',limit});
  if('skipped' in result)return NextResponse.json({ok:true,job,skipped:result.skipped,started_at:started.toISOString()},{headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({ok:result.receipt.status==='success',job,limit:limit??null,started_at:started.toISOString(),receipt:publicReceipt(result.receipt)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof IndustryDbError?e.code:'sync_failed','Industry sync failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
