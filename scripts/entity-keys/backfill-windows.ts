/**
 * Evidenced holding windows (spec §4.3.2): earliest row per ticker → stocks_universe.list_date,
 * latest open row → delist_date; conflicts are quarantined. A-share and HK universe rows only
 * (US carries no list_date).
 *   npx tsx scripts/entity-keys/backfill-windows.ts [--apply]
 * Dry run (default): prints the plan, writes nothing. --apply records an ingest batch (dataset
 * entities.windows) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.windows;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;

async function load(tables:TableClient){
 const rows:WindowRow[]=(await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY)).map(r=>({
  issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),valid_to:str(r.valid_to),
  valid_from_method:String(r.valid_from_method),valid_to_method:str(r.valid_to_method),
  provenance:(r.provenance&&typeof r.provenance==='object'?r.provenance:{}) as Record<string,unknown>,
 }));
 const universe=new Map<string,UniverseDates>();
 for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))
  universe.set(String(r.ticker),{ticker:String(r.ticker),list_date:str(r.list_date),delist_date:str(r.delist_date),source:str(r.source),source_updated_at:str(r.source_updated_at)});
 return {rows:rows.filter(r=>universe.has(r.ticker)),universe};
}

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--apply')){console.error('usage: backfill-windows.ts [--apply]');process.exit(2);}
 const tables=supabaseTableClient(getAdminSupabase());
 const asOf=new Date().toISOString().slice(0,10);
 if(!argv.includes('--apply')){
  const {rows,universe}=await load(tables);
  const plan=planWindowBackfill(rows,universe,asOf);
  console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',rows:rows.length,
   changes:{from:plan.changes.filter(c=>c.kind==='from').length,to:plan.changes.filter(c=>c.kind==='to').length},
   conflicts:plan.conflicts.length,unchanged:plan.unchanged,firstConflicts:plan.conflicts.slice(0,10).map(c=>({ticker:c.row.ticker,valid_from:c.row.valid_from,reason:c.reason}))},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'backfill-windows',dataset:DATASET,toolVersions:{rules:WINDOWS_RULES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {rows,universe}=await load(tables);
  ({counts,errors}=await applyWindowBackfill(tables,planWindowBackfill(rows,universe,asOf),{batchId,dataset:DATASET}));
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
