/**
 * Load US issuers (by CIK) and their listed tickers from SEC company_tickers_exchange.json,
 * restricted to tickers present in stocks_universe (market='US').
 *
 *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]
 *
 * Download separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
 * Without --apply this is a dry run: it prints the plan summary and writes nothing (no ingest batch).
 * With --apply it records an ingest_batches receipt (dataset entities.sec) and a freshness attempt.
 * Exit 1 when the batch failed (an empty plan included), any row failed or any input row was
 * rejected as invalid (rejected_summary); 2 on bad arguments.
 *
 * tsx does NOT load .env.local. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by
 * exporting them, or run: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
 * Both the universe read (dry run included) and --apply need them.
 */
import {readFileSync,statSync} from 'node:fs';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import type {TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
import type {BatchError,BatchStatus} from '../../src/lib/dq/batches';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {SEC_DATASET,applySecLoad,errorMessage,loaderOutcome,planSecLoad} from '../../src/lib/entities/load-sec';
import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=SEC_DATASET;
const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]';

/** A YYYY-MM-DD that names a real calendar day (2026-02-30 is rejected). */
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const d=new Date(`${s}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;})();

function parseArgs(argv:string[]):{file:string;apply:boolean;asOf:string}{
 let file:string|undefined,apply=false,asOf=new Date().toISOString().slice(0,10);
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--apply')apply=true;
  else if(a==='--as-of'){asOf=argv[++i]??'';}
  else if(a.startsWith('--')){console.error(USAGE);process.exit(2);}
  else if(!file)file=a;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!file||!isCalendarDate(asOf)){console.error(USAGE);process.exit(2);}
 return {file,apply,asOf};
}

async function loadPlan(client:TableClient,file:string,asOf:string){
 if(statSync(file).size>MAX_SEC_FILE_BYTES)throw new Error('file_too_large');
 const parsed=parseSecCompanyTickersExchange(readFileSync(file,'utf8'));
 const universeRows=await selectAll(client,'stocks_universe',{market:'US'},'ticker');
 const universe=new Set(universeRows.map(r=>String(r.ticker)));
 return {parsed,universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
}

async function dryRun(client:TableClient,file:string,asOf:string){
 const {parsed,universeSize,plan}=await loadPlan(client,file,asOf);
 console.log(JSON.stringify({
  mode:'dry-run (no ingest batch written; pass --apply to write)',asOf,
  parsed:parsed.rows.length,rejected:parsed.rejected.length,universe:universeSize,
  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,
  firstSkipped:plan.skipped.slice(0,10),firstRejected:parsed.rejected.slice(0,10),
 },null,1));
}

async function apply(client:TableClient,file:string,asOf:string):Promise<0|1>{
 // The batch starts before reading the file so a malformed or oversized file still leaves a failed receipt.
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf}});
 let counts=emptyCounts();
 let errors:BatchError[]=[];
 let skipped:Record<string,number>={};
 let rejected:Record<string,number>={};
 let status:BatchStatus='failed';
 try{
  const {parsed,plan}=await loadPlan(client,file,asOf);
  const result=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:parsed.rows.length+parsed.rejected.length,rejected:parsed.rejected}});
  ({counts,errors}=result);
  skipped=result.skippedSummary;
  rejected=result.rejectedSummary;
 }catch(e){
  errors=[...errors,{code:'exception',message:errorMessage(e)}];
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts,rejected);
 await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
 console.log(JSON.stringify({batchId,status,counts,skipped,rejected,errors:errors.slice(0,20)},null,1));
 return outcome.exitCode;
}

async function main(){
 const {file,apply:doApply,asOf}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,file,asOf);return;}
 process.exitCode=await apply(client,file,asOf);
}

main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
