/**
 * Load US issuers and listed securities from SEC company_tickers_exchange.json, then run
 * ticker-change detection (spec 3 §4.3.4).
 *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]
 * Download the file separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
 * and pass the download instant as --fetched-at (required with --apply; written to tool_versions with the
 * file sha256 and data row count).
 * --apply refuses (exit 1, no batch) when as_of or fetched_at is older than the last successful batch
 * (stale_snapshot) or the file has fewer than 90% of its data rows (incomplete_snapshot).
 * Without --apply this is a dry run: prints the plan and the snapshot check, writes nothing.
 * Closing a vanished ticker needs the CIK's SEC submissions (second source): fetched live and stored in
 * reconcile-raw (EDGAR_USER_AGENT, else DEFAULT_USER_AGENT).
 * Exit 1 when the batch failed, any row failed or any input row was rejected; 2 on bad arguments.
 * tsx does NOT load .env.local: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
 */
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {supabaseRawStore} from '../../src/lib/dq/raw-store';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,loaderOutcome,planSecLoad,snapshotMetaOf,type SnapshotMeta} from '../../src/lib/entities/load-sec';
import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=SEC_DATASET;
const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]';

/** A YYYY-MM-DD that names a real calendar day (2026-02-30 is rejected). */
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const d=new Date(`${s}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;})();
/** An ISO-8601 instant with an explicit zone (Z or ±hh:mm). */
const isInstant=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));

function parseArgs(argv:string[]):{file:string;apply:boolean;asOf:string;fetchedAt:string|null}{
 let file:string|undefined,apply=false,asOf=new Date().toISOString().slice(0,10),fetchedAt:string|null=null;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--apply')apply=true;
  else if(a==='--as-of')asOf=argv[++i]??'';
  else if(a==='--fetched-at')fetchedAt=argv[++i]??'';
  else if(a.startsWith('--')){console.error(USAGE);process.exit(2);}
  else if(!file)file=a;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!file||!isCalendarDate(asOf)||(fetchedAt!==null&&!isInstant(fetchedAt))||(apply&&fetchedAt===null)){console.error(USAGE);process.exit(2);}
 return {file,apply,asOf,fetchedAt};
}

async function loadPlan(client:TableClient,file:string,asOf:string){
 if(statSync(file).size>MAX_SEC_FILE_BYTES)throw new Error('file_too_large');
 const bytes=readFileSync(file);
 const parsed=parseSecCompanyTickersExchange(bytes.toString('utf8'));
 const universeRows=await selectAll(client,'stocks_universe',{market:'US'},'ticker');
 const universe=new Set(universeRows.map(r=>String(r.ticker)));
 return {parsed,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
}

/** Successful (success/partial) entities.sec receipts, newest first. */
async function priorSnapshots(client:TableClient):Promise<SnapshotMeta[]>{
 const rows:Row[]=[];
 for(const status of ['success','partial'])rows.push(...await client.select('ingest_batches',{dataset:DATASET,status},{orderBy:'started_at',desc:true,limit:50}));
 return rows.sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at))).map(snapshotMetaOf).filter((m):m is SnapshotMeta=>m!==null);
}

async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:string|null){
 const {parsed,sha256,universeSize,plan}=await loadPlan(client,file,asOf);
 const prev=(await priorSnapshots(client))[0]??null;
 const rows=parsed.rows.length+parsed.rejected.length;
 console.log(JSON.stringify({
  mode:'dry-run (no ingest batch written; pass --apply --fetched-at <ISO> to write)',asOf,sha256,rows,
  snapshotCheck:fetchedAt?checkSnapshot(prev,{as_of:asOf,fetched_at:fetchedAt,rows}):'needs --fetched-at',previous:prev,
  parsed:parsed.rows.length,rejected:parsed.rejected.length,universe:universeSize,
  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,
  firstSkipped:plan.skipped.slice(0,10),firstRejected:parsed.rejected.slice(0,10),
 },null,1));
}

const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};

async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
 const {parsed,sha256,plan}=await loadPlan(client,file,asOf);
 const rows=parsed.rows.length+parsed.rejected.length;
 const prior=await priorSnapshots(client);
 const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
 if(check!=='ok'){console.error(JSON.stringify({refused:check,asOf,fetchedAt,rows,previous:prior[0]}));return 1;}
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows)}});
 const counts=emptyCounts();
 let errors:BatchError[]=[];
 let rejected:Record<string,number>={};
 let status:BatchStatus='failed';
 try{
  const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;
  const raw=supabaseRawStore(getAdminSupabase());
  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId},{
   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256};}catch{return null;}},
   lastSeenAsOf:async before=>prior.map(p=>p.as_of).filter(d=>d<before).sort().at(-1)??null,
  });
  // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
  changes.counts.fetched=0;
  add(counts,changes.counts);errors=[...errors,...changes.errors];
 }catch(e){
  errors=[...errors,{code:'exception',message:errorMessage(e)}];
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts,rejected);
 await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 return outcome.exitCode;
}

async function main(){
 const {file,apply:doApply,asOf,fetchedAt}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,file,asOf,fetchedAt);return;}
 process.exitCode=await apply(client,file,asOf,fetchedAt!);
}

main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
