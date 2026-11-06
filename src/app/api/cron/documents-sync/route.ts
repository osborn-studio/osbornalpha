// src/app/api/cron/documents-sync/route.ts
// Document sync trigger (spec §6.3): CRON_SECRET bearer (authorized() copied from facts-sync),
// source=edgar|cninfo|hkexnews required exactly once, limit 1..200 (default 25), every query parameter
// at most once (a repeated one is invalid_parameter:<name>), maxDuration 300 with a 240 s deadline
// handed to the core (no new issuer under 90 s: deadline_hit). Without VERCEL_GIT_COMMIT_SHA the run is
// refused (503 code_version_unavailable, spec §6.1). sinceYear = this year − 10 (spec §1.1). The HTTP
// receipt carries codes, keys and counts only, never messages. A duplicate cron delivery is harmless:
// issuers leased by the first run are skipped as 'leased'. Owner-safety gate: nothing runs unless
// DOCUMENTS_SYNC_ENABLED=true (after auth: 200 {skipped:'disabled'}, no deps, no DB, no batch); the owner
// enables it once the migrations are applied and the first manual `--apply --limit 5` has run.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {DEADLINE_MS,DocumentsSyncError,runDocumentsSync} from '@/lib/documents/sync';
import type {DocSyncReceipt} from '@/lib/documents/sync';
import {documentsCodeVersion,productionDocumentsDeps} from '@/lib/documents/deps';
import type {ListedSource} from '@/lib/documents/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEFAULT_LIMIT=25,MAX_LIMIT=200;
const SOURCES:readonly ListedSource[]=['edgar','cninfo','hkexnews'];
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function publicReceipt(r:DocSyncReceipt){
 const errs=(list:{code:string;key?:string}[])=>list.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key});
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:errs(r.errors),idle:r.idle,
  issuers:r.issuers.map(i=>({issuerId:i.issuerId,fetchKey:i.fetchKey,outcome:i.outcome,code:i.code,counts:i.counts,errors:errs(i.errors)}))};
}

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 if(process.env.DOCUMENTS_SYNC_ENABLED!=='true')return NextResponse.json({skipped:'disabled'},{status:200,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url);
 for(const name of new Set(url.searchParams.keys()))if(url.searchParams.getAll(name).length>1)return err(`invalid_parameter:${name}`,`${name} may be given once`,400);
 const source=url.searchParams.get('source');
 if(source===null||!(SOURCES as readonly string[]).includes(source))return err('invalid_parameter:source','source must be edgar, cninfo or hkexnews',400);
 const limitRaw=url.searchParams.get('limit');
 let limit=DEFAULT_LIMIT;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 const codeVersion=documentsCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionDocumentsDeps(source as ListedSource,{deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runDocumentsSync(deps,{source:source as ListedSource,limit,sinceYear:started.getUTCFullYear()-10,dryRun:false,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',source,limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof DocumentsSyncError?e.code:'sync_failed','Documents sync failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
