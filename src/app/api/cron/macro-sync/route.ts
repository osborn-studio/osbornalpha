// src/app/api/cron/macro-sync/route.ts
// Daily US macro sync (spec §4.4 steps 1–4, §8): CRON_SECRET bearer via authorizedCronRequest; upsert the
// catalog mirror; one ingest batch (producer 'ts-fred', dataset 'macro.fred') over every active native FRED
// series: fetch (retry/backoff) → parse → ingestEvidence; derive US in the same batch; MacroDb.finalizeBatch (第 6 稿 P1-1: the
// macro-owned finalizer, no tokens — cron batches have no run row; a fatal abort finalizes 'failed' with the actual counts, P2-4);
// A series is fetched in full from FRED_COSD (2000-01-01, spec §4.4) until its persisted eligible data reaches back to
// FRED_BACKFILL_DONE_BY (a failed oldest chunk therefore keeps the full window next run, T7-2); afterwards the
// daily run asks for a recent window only (daily series 400 days, monthly 6 years so the BLS 5-year
// seasonal revisions are seen) to keep the run inside maxDuration.
// recordAttempt('macro.fred', daily, ok = status !== 'failed' and a usable native row landed). Derivation runs only when this
// run produced at least one usable native row (Σ ingestEvidence usable: inserted/versioned/duplicates minus previously_rejected;
// 第 5 稿 P2-2, 第 6 稿 P2-1): otherwise re-derived old history
// would come back as duplicates and turn an all-failed run into 'partial'; instead the batch gets {code:'no_native_outcomes'}
// and finishes failed. The receipt reports native_counts and derived_counts separately. Only US is published here (CN publishes
// after ingest finish). ?preview=1 fetches and parses only and returns counts and samples: ZERO database
// writes, ZERO evidence uploads (it never touches deps.db / deps.evidence / deps.tables). A missing
// code_version refuses a real run (preview does not write, so it needs none). Receipts carry codes,
// keys and counts only, never messages.
import {NextResponse} from 'next/server';
import {startBatch} from '@/lib/dq/batches';
import type {BatchError} from '@/lib/dq/batches';
import {recordAttempt} from '@/lib/dq/freshness';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import {CATALOG_VERSION,MACRO_CATALOG,collectableOf} from '@/lib/macro/catalog';
import {productionMacroDeps} from '@/lib/macro/deps';
import type {MacroDeps} from '@/lib/macro/deps';
import {IngestAbort,abortError,addCounts,batchFinalizeInput,deriveAndWrite,emptyChunkCounts,ingestEvidence} from '@/lib/macro/ingest';
import type {IngestReceipt} from '@/lib/macro/ingest';
import {FRED_BACKFILL_DONE_BY,FRED_COSD,FRED_FETCHER_VERSION,FredFetchError,fetchFredCsv,fredCosdFor} from '@/lib/macro/providers/fred';
import {FRED_PARSER_VERSION,FredParseError,parseFredCsv} from '@/lib/macro/parsers/fred-csv';
import {MACRO_RULES_VERSION} from '@/lib/macro/quality';
import type {EvidenceInput,MacroSeriesDef,ParsedPoint} from '@/lib/macro/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,SAMPLE=3;
const NO_STORE={'Cache-Control':'no-store'};
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:NO_STORE});
const errCode=(e:unknown)=>e instanceof FredFetchError?e.code:e instanceof FredParseError?`parse_${e.code}`:'fetch_failed';
const publicErrors=(errors:BatchError[])=>errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key});

const fetchEvidence=(deps:MacroDeps,def:MacroSeriesDef,signal:AbortSignal,cosd:string)=>
 fetchFredCsv(def.source!.seriesKey,{fetch:deps.fetch,sleep:deps.sleep,now:deps.now,signal,cosd});
const parseEvidence=(def:MacroSeriesDef,evidence:EvidenceInput)=>
 parseFredCsv(evidence.bytes,{seriesId:def.id,code:def.source!.seriesKey,period:def.period});
async function fetchAndParse(deps:MacroDeps,def:MacroSeriesDef,signal:AbortSignal,cosd:string){
 const evidence=await fetchEvidence(deps,def,signal,cosd);
 return {evidence,parsed:parseEvidence(def,evidence)};
}

/** Backfill is complete only when persisted eligible data reaches back to the start of the full window (T7-2). Any read
 *  failure counts as incomplete: the full window is the safe side. */
async function backfillComplete(deps:MacroDeps,id:string):Promise<boolean>{
 try{return (await deps.db.eligibleHistory(id,{from:FRED_COSD,to:FRED_BACKFILL_DONE_BY,maxRows:500})).length>0;}
 catch{return false;}
}

/** Fetch + parse only. Must never touch deps.db, deps.evidence or deps.tables. */
async function preview(deps:MacroDeps,defs:MacroSeriesDef[],signal:AbortSignal){
 const series=[];let fetched=0;
 for(const def of defs){
  try{
   const {evidence,parsed}=await fetchAndParse(deps,def,signal,FRED_COSD);
   fetched+=parsed.length;
   series.push({series_id:def.id,code:def.source!.seriesKey,points:parsed.length,first:parsed[0]?.periodEnd??null,last:parsed[parsed.length-1]?.periodEnd??null,
    sample:parsed.slice(-SAMPLE).map(p=>({period_end:p.periodEnd,value_text:p.valueText})),sha256:evidence.sha256,bytes:evidence.bytes.byteLength});
  }catch(e){series.push({series_id:def.id,code:def.source!.seriesKey,error:errCode(e)});}
 }
 return NextResponse.json({ok:series.every(s=>!('error' in s)),preview:true,catalogVersion:CATALOG_VERSION,counts:{fetched},series},{status:200,headers:NO_STORE});
}

async function sync(deps:MacroDeps,defs:MacroSeriesDef[],codeVersion:string,signal:AbortSignal){
 const today=deps.now().toISOString().slice(0,10);
 await deps.db.upsertCatalog(MACRO_CATALOG,CATALOG_VERSION,MACRO_RULES_VERSION);
 const {batchId}=await startBatch(deps.tables,{producer:'ts-fred',dataset:'macro.fred',codeVersion,triggeredBy:'cron',
  toolVersions:{fetcher:FRED_FETCHER_VERSION,parser:FRED_PARSER_VERSION,catalog:CATALOG_VERSION,rules:MACRO_RULES_VERSION}});
 let native=emptyChunkCounts(),nativeUsable=0,derivedCounts=emptyChunkCounts(),counts=emptyChunkCounts();const errors:BatchError[]=[];
 // 四轮 P2-2: aggregates move after EVERY completed receipt, and an aborted call's partial (its committed outcomes) is merged
 // exactly once — the call never returned a receipt — so a forced failure finalizes the counts as they were committed.
 const take=(rec:IngestReceipt,phase:'native'|'derived')=>{
  if(phase==='native'){native=addCounts(native,rec.counts);nativeUsable+=rec.usable;}else derivedCounts=addCounts(derivedCounts,rec.counts);
  counts=addCounts(counts,rec.counts);errors.push(...rec.errors);
 };
 // T7-3: a series that failed to fetch or parse counts once, natively and in the aggregate
 const failSeries=(code:string,key:string,message?:string)=>{native.failed+=1;counts.failed+=1;errors.push(message===undefined?{code,key}:{code,key,message});};
 const settle=async(phase:'native'|'derived',call:()=>Promise<IngestReceipt>)=>{
  let rec:IngestReceipt;
  try{rec=await call();}catch(e){if(e instanceof IngestAbort&&e.partial)take(e.partial,phase);throw e;}
  take(rec,phase);
 };
 try{
  // backfill decision on persisted eligible rows only: rows left by an abandoned batch never count as history (第 4 稿 P1-5)
  for(const def of defs){
   let evidence:EvidenceInput;
   try{evidence=await fetchEvidence(deps,def,signal,fredCosdFor(def.period,await backfillComplete(deps,def.id),today));}
   catch(e){failSeries(errCode(e),def.id);continue;}
   let parsed:ParsedPoint[];
   try{parsed=parseEvidence(def,evidence);}
   catch(e){
    // T7-1: keep the fetched bytes + retrieval for investigation / replay (an empty parse stores evidence and receipt, writes nothing)
    let retrievalId='unstored';
    try{
     const stored=await ingestEvidence(deps,{batchId,adapter:'fred_csv',retrievals:[{evidence,parsed:[]}]});
     retrievalId=stored.retrievalIds[0]??'unstored';
    }catch(x){if(x instanceof IngestAbort)throw x;}
    failSeries(errCode(e),def.id,`retrieval ${retrievalId}: ${e instanceof Error?e.message:'parse failed'}`);
    continue;
   }
   await settle('native',()=>ingestEvidence(deps,{batchId,adapter:'fred_csv',retrievals:[{evidence,parsed}]}));   // no owner token: cron batches have no run
  }
  if(nativeUsable>0){                                                                               // 第 6 稿 P2-1
   await settle('derived',()=>deriveAndWrite(deps,'US',batchId));
  }else errors.push({code:'no_native_outcomes'});                                                   // 第 5 稿 P2-2
 }catch(e){
  // Fatal abort (第 6 稿 P2-4): an unbindable quarantined row (IngestAbort quarantine_link_failed, native or derivation) or any crash.
  // counts already hold every completed receipt plus the aborted call's partial (四轮 P2-2). Finalize FAILED explicitly with them — batchStatusFromCounts would say 'partial' once native rows landed, leaving
  // them publication-eligible — so the batch never stays 'running' and its rows never publish; then rethrow.
  errors.push(e instanceof IngestAbort?abortError(e):{code:'sync_crashed'});
  // If finalize itself fails, retry once and log. A batch left 'running' is never publication-eligible and is swept by the next
  // run's ineligible-row semantics (latestEligible/eligibleHistory ignore it; its rows are re-fetched and re-written).
  const finalInput=batchFinalizeInput({counts,errors},deps.now(),'failed');
  try{await deps.db.finalizeBatch(batchId,finalInput,null);}
  catch{
   console.error('macro-sync: finalizeBatch failed in fatal abort; retrying once',{batchId});
   await deps.db.finalizeBatch(batchId,finalInput,null).catch(()=>console.error('macro-sync: finalizeBatch retry failed; batch left running',{batchId}));
  }
  await recordAttempt(deps.tables,'macro.fred',{ok:false,cadence:'daily'}).catch(()=>undefined);
  throw e;
 }
 const {status:batchStatus}=await deps.db.finalizeBatch(batchId,batchFinalizeInput({counts,errors},deps.now()),null);   // no run row: no tokens
 const nativeLanded=nativeUsable>0;
 await recordAttempt(deps.tables,'macro.fred',{ok:batchStatus!=='failed'&&nativeLanded,cadence:'daily'});
 // TASK 11: publishRegion(region)
 return NextResponse.json({ok:batchStatus==='success',date:today,batchId,status:batchStatus,counts,native_counts:native,native_usable:nativeUsable,derived_counts:derivedCounts,errors:publicErrors(errors)},{status:200,headers:NO_STORE});
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorizedCronRequest(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const flags=new URL(request.url).searchParams.getAll('preview');
 if(flags.length>1||(flags.length===1&&flags[0]!=='1'))return err('invalid_parameter:preview','preview must be 1 or absent',400);
 const isPreview=flags.length===1;
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion&&!isPreview)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const deps=productionMacroDeps({codeVersion:codeVersion??'preview'});
 const defs=collectableOf('fred_csv');
 const signal=AbortSignal.timeout(DEADLINE_MS);
 try{
  return isPreview?await preview(deps,defs,signal):await sync(deps,defs,codeVersion!,signal);
 }catch{
  return err('sync_failed','Macro sync failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
