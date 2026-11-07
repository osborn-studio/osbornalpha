/**
 * SEC acceptance times for edgar filings (plan 3 spec §4.5, E7).
 *
 *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--apply] [--full-history]
 *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts --report
 *
 * Without --issuer: every US fact_sync_scope row with priority > 0 (fetch_key = 10-digit CIK);
 * --issuer tickers are resolved by today's ownership (unknown or no CIK → exit 2).
 * Dry run (default): fetches submissions (raw bytes kept in memory), reports what would be written;
 * no batch, no database write. --apply: one ingest batch (producer enrich-acceptance, dataset
 * DATASETS.acceptance, triggered_by script, code version required), set_filing_acceptance per
 * filing, raw submissions into the reconcile-raw bucket, freshness recorded (daily).
 * Pending filings older than 3 years are skipped (acceptance_out_of_window); --full-history (with --issuer only) lifts that bound.
 * --report (alone): the E7 measure — edgar filings of in-scope US issuers with accepted_at / all —
 * as one JSON line (target ≥ 0.99; a miss is reported as the real number, never padded).
 * sec.filing_date_vs_submissions results are listed per issuer; with --apply they are recorded as
 * sec.filing_date_vs_submissions rows (record.ts).
 * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,isInfoError,startBatch} from '../../src/lib/dq/batches';
import type {BatchCounts,BatchError} from '../../src/lib/dq/batches';
import {DATASETS} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {recordReconciliationDetailed} from '../../src/lib/dq/reconcile/record';
import type {ReconcileResultInput} from '../../src/lib/dq/reconcile/types';
import {DATE_MISMATCH_PAIR,enrichAcceptance} from '../../src/lib/facts/providers/sec-acceptance';
import type {AcceptanceDeps} from '../../src/lib/facts/providers/sec-acceptance';
import {makeBudget,resolveCodeVersion} from '../../src/lib/facts/sync';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: enrich-acceptance.ts [--issuer <ticker>]... [--full-history] [--apply] | --report';
const E7_TARGET=0.99;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function report():Promise<void>{
 const tables=supabaseTableClient(getAdminSupabase());
 const scope=(await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(r=>Number(r.priority)>0);
 const ids=new Set(scope.map(r=>String(r.issuer_id)));
 let total=0,accepted=0;
 for(const f of await selectAll(tables,'filings',{market:'US',source:'edgar'},'filing_id')){   // one query for all issuers, grouped here
  if(!ids.has(String(f.issuer_id)))continue;
  total++;if(f.accepted_at!==null&&f.accepted_at!==undefined)accepted++;
 }
 const rate=total===0?null:accepted/total;
 console.log(JSON.stringify({measure:'E7',issuers:scope.length,edgar_filings:total,with_accepted_at:accepted,rate,target:E7_TARGET,meets:rate!==null&&rate>=E7_TARGET}));
}

async function main():Promise<void>{
 const argv=process.argv.slice(2);let apply=false,doReport=false,fullHistory=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--apply')apply=true;else if(x==='--full-history')fullHistory=true;else if(x==='--report')doReport=true;else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else{console.error(USAGE);process.exit(2);}
 }
 if(fullHistory&&tickers.length===0){console.error('--full-history needs --issuer');process.exit(2);}
 if(doReport){if(apply||fullHistory||tickers.length>0){console.error(USAGE);process.exit(2);}await report();return;}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
 const today=new Date().toISOString().slice(0,10);
 let issuers:{issuerId:string;cik10:string;label:string}[]=[];
 if(tickers.length===0){
  issuers=(await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(r=>Number(r.priority)>0).map(r=>({issuerId:String(r.issuer_id),cik10:String(r.fetch_key),label:String(r.fetch_key)}));
 }else for(const t of tickers){
  const r=await resolveIssuer(tables,{ticker:t},{asOf:today});const cik=r?.identifiers.cik;
  if(!r||!cik){console.error(`unknown ticker or no CIK: ${t}`);process.exit(2);}
  issuers.push({issuerId:r.issuer_id,cik10:cik.padStart(10,'0'),label:t});
 }
 const raw=apply?supabaseRawStore(sb):memoryRawStore();
 const writes:AcceptanceDeps['db']=apply?db:{filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:async()=>true};   // dry run: count, never write
 let batchId:string|null=null;
 if(apply){
  const codeVersion=resolveCodeVersion();
  if(!codeVersion){console.error('code version unavailable (VERCEL_GIT_COMMIT_SHA or a git checkout)');process.exit(1);}
  batchId=(await startBatch(tables,{producer:'enrich-acceptance',dataset:DATASETS.acceptance,toolVersions:{source:'sec_submissions'},codeVersion,triggeredBy:'script'})).batchId;
 }
 const counts:BatchCounts=emptyCounts();const errors:BatchError[]=[];let mismatches=0,mismatchDuplicates=0,issuerFailures=0;
 const budget=makeBudget(null);
 for(const it of issuers){
  try{
   const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom}),
    ...(apply?{recordDateMismatch:async(r:ReconcileResultInput)=>{if((await recordReconciliationDetailed(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:batchId})).duplicate)mismatchDuplicates++;}}:{})},{issuerId:it.issuerId,cik10:it.cik10},budget,{fullHistory});
   for(const k of Object.keys(counts) as (keyof BatchCounts)[])counts[k]+=out.counts[k];
   errors.push(...out.errors);mismatches+=out.mismatches.length;
   if(out.counts.failed>0||out.errors.some(e=>!isInfoError(e)))issuerFailures++;
   console.log(JSON.stringify({issuer:it.issuerId,label:it.label,counts:out.counts,errors:out.errors.map(e=>e.code),date_mismatches:out.mismatches.map(m=>m.natural_key)}));
  }catch(e){
   issuerFailures++;errors.push({code:'unknown',key:it.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});
   console.log(JSON.stringify({issuer:it.issuerId,label:it.label,error:e instanceof Error?e.message:String(e)}));
  }
  await pause(120);   // SEC fair access between issuers (sec-submissions.ts paces its own page requests, incl. the coverFrom pages)
 }
 let status='dry_run';
 if(batchId!==null){
  status=await finishBatch(tables,batchId,{counts,errors});
  await recordAttempt(tables,DATASETS.acceptance,{ok:status==='success',cadence:'daily',detail:{issuers:issuers.length,...counts,date_mismatches:mismatches}});
 }
 console.log(JSON.stringify({status,issuers:issuers.length,counts,date_mismatches:mismatches,...(apply?{date_mismatch_duplicates:mismatchDuplicates}:{})}));
 process.exit((batchId!==null&&(status==='failed'||status==='partial'))||(batchId===null&&issuerFailures>0)?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
