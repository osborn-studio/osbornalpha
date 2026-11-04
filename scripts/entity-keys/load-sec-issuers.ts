/**
 * Load US issuers (by CIK) and their listed tickers from SEC company_tickers_exchange.json,
 * restricted to tickers present in stocks_universe (market='US').
 *
 *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]
 *
 * Download separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
 * Without --apply this is a dry run: it prints the plan summary and writes nothing (no ingest batch).
 * With --apply it records an ingest_batches receipt (dataset entities.sec) and a freshness attempt.
 *
 * tsx does NOT load .env.local. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by
 * exporting them, or run: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
 * Both the universe read (dry run included) and --apply need them.
 */
import {readFileSync} from 'node:fs';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import type {TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
import type {BatchError,BatchStatus} from '../../src/lib/dq/batches';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {attachSecurity,upsertIssuerByIdentifiers} from '../../src/lib/entities/issuers';
import {planSecLoad} from '../../src/lib/entities/load-sec';
import {parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET='entities.sec';
const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]';
const MAX_ERRORS=200;

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
 if(!file||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(asOf))){console.error(USAGE);process.exit(2);}
 return {file,apply,asOf};
}

const message=(e:unknown)=>e instanceof Error?e.message:String(e);

async function loadPlan(client:TableClient,file:string,asOf:string){
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

async function apply(client:TableClient,file:string,asOf:string):Promise<BatchStatus>{
 // The batch starts before parsing so a malformed file still leaves a failed receipt.
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf}});
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 const pushError=(e:BatchError)=>{if(errors.length<MAX_ERRORS)errors.push(e);};
 let status:BatchStatus='failed';
 try{
  const {parsed,plan}=await loadPlan(client,file,asOf);
  counts.fetched=parsed.rows.length;
  for(const r of parsed.rejected){counts.failed++;pushError({code:'rejected_row',key:String(r.index),message:r.reason});}

  const issuerByCik=new Map<string,string>();
  for(const issuer of plan.issuers){
   try{
    const res=await upsertIssuerByIdentifiers(client,issuer);
    if(res.conflict||!res.issuer_id){counts.quarantined++;pushError({code:'issuer_conflict',key:issuer.cik,message:res.reason});continue;}
    issuerByCik.set(issuer.cik,res.issuer_id);
    if(res.created)counts.inserted++;else counts.duplicates++;
   }catch(e){counts.failed++;pushError({code:'issuer_error',key:issuer.cik,message:message(e)});}
  }

  for(const sec of plan.securities){
   const issuer_id=issuerByCik.get(sec.cik);
   if(!issuer_id)continue; // its issuer was quarantined or failed; already counted there
   const {cik:_cik,...rest}=sec;
   try{
    const res=await attachSecurity(client,{...rest,issuer_id});
    if(res==='inserted')counts.inserted++;
    else if(res==='duplicate')counts.duplicates++;
    else{counts.quarantined++;pushError({code:'ownership_conflict',key:sec.ticker});}
   }catch(e){
    counts.failed++;
    const msg=message(e);
    pushError({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key:sec.ticker,message:msg});
   }
  }
 }catch(e){
  pushError({code:'exception',message:message(e)});
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${message(e)}`);status='failed';}
  await recordAttempt(client,DATASET,{ok:status!=='failed',cadence:'event'});
 }
 console.log(JSON.stringify({batchId,status,counts},null,1));
 return status;
}

async function main(){
 const {file,apply:doApply,asOf}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,file,asOf);return;}
 const status=await apply(client,file,asOf);
 if(status==='failed')process.exit(1);
}

main().catch(e=>{console.error(message(e));process.exit(1);});
