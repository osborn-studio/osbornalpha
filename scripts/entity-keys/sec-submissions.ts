/**
 * SEC submissions identity evidence (spec §4.3.3) for US in-scope issuers with a CIK: fetches
 * submissions (all filings.files[] pages), stores the raw bytes, and writes formerNames aliases,
 * 8-A/25 evidence_only claims and SEC-listed tickers (first_observed).
 *   npx tsx scripts/entity-keys/sec-submissions.ts [--issuer <uuid>]... [--apply]
 * Dry run (default): fetches and prints what would be written (raw bytes hashed in memory only).
 * --apply records an ingest batch (dataset entities.sec-submissions) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; EDGAR_USER_AGENT (else DEFAULT_USER_AGENT).
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {SUBMISSIONS_PARSER_VERSION,SecSubmissionsError,submissionsClient,submissionsEvidenceClaims} from '../../src/lib/entities/identifiers/sec-submissions';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {applySubmissionsEvidence} from '../../src/lib/entities/submissions-evidence';
import {normalizeSecurityTicker} from '../../src/lib/securities/ticker';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.submissions;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_PAGES='1993-01-01';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]=(a[k]??0)+(b[k]??0);/* F4: deferred is optional */};

async function main(){
 const argv=process.argv.slice(2);
 const ids:string[]=[];let apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--issuer'&&UUID.test(argv[i+1]??''))ids.push(argv[++i].toLowerCase());
  else{console.error('usage: sec-submissions.ts [--issuer <uuid>]... [--apply]');process.exit(2);}
 }
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const inScope=new Set((await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(s=>typeof s.priority==='number'&&s.priority>0).map(s=>String(s.issuer_id)));
 const issuers=(await selectAll(tables,'issuers',{status:'active'},'issuer_id'))
  .filter(i=>typeof i.cik==='string'&&inScope.has(String(i.issuer_id))&&(ids.length===0||ids.includes(String(i.issuer_id))));
 const universe=new Set((await selectAll(tables,'stocks_universe',{market:'US'},'ticker')).map(r=>String(r.ticker)));
 const raw=apply?supabaseRawStore(admin):memoryRawStore();
 const client=submissionsClient({fetch,raw});
 const batchId=apply?(await startBatch(tables,{producer:'sec-submissions',dataset:DATASET,toolVersions:{parser:SUBMISSIONS_PARSER_VERSION,as_of:asOf}})).batchId:null;
 const counts=emptyCounts();let errors:BatchError[]=[];let status:BatchStatus='failed';
 const preview:Record<string,unknown>[]=[];
 try{
  for(const i of issuers){
   const issuerId=String(i.issuer_id),cik=String(i.cik);
   try{
    const snapshot=await client.fetch(cik,{coverFrom:ALL_PAGES});
    const open=await tables.select('issuer_securities',{issuer_id:issuerId,valid_to:null},{orderBy:'ticker'});
    // aliases attach to the issuer's primary row only; with no is_primary row there is no primary (apply then skips the names)
    const primary=open.find(r=>r.is_primary===true);
    const primaryTicker=primary?String(primary.ticker):null;
    if(!batchId){
     // the preview fetches every page too (coverFrom=ALL_PAGES) but writes nothing
     const normalized=snapshot.parsed.tickers.map(t=>universe.has(t)?t:normalizeSecurityTicker(t,'US'));
     preview.push({cik,formerNames:snapshot.parsed.formerNames.length,evidenceClaims:submissionsEvidenceClaims(issuerId,snapshot,asOf).length,
      secOnlyTickers:normalized.filter((t):t is string=>t!==null&&universe.has(t)&&!open.some(r=>r.ticker===t)),pages:snapshot.pages.length,complete:snapshot.complete});
     continue;
    }
    const res=await applySubmissionsEvidence(tables,{issuerId,primaryTicker,snapshot,asOf,batchId,dataset:DATASET,universe});
    add(counts,res.counts);errors=[...errors,...res.errors];
   }catch(e){
    counts.failed++;
    const raw=e instanceof SecSubmissionsError&&e.raw?` [raw sha256=${e.raw.sha256} path=${e.raw.path}]`:'';
    errors.push({code:e instanceof SecSubmissionsError?e.code:'exception',key:cik,message:errorMessage(e)+raw});
   }
  }
 }finally{
  if(batchId){
   try{status=await finishBatch(tables,batchId,{counts,errors});}
   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
  }
 }
 if(!batchId){console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',issuers:issuers.length,preview,errors},null,1));return;}
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
