/**
 * Fill issuers.cninfo_org_id from 巨潮 topSearch (spec §4.1.6): active issuers with a USCI, no orgId
 * and an open .SH/.SZ row; exact code match; one request every 600 ms.
 *   npx tsx scripts/entity-keys/fill-cninfo-org-id.ts [--apply]
 * Dry run (default): looks up and prints, writes nothing (no batch, no bucket). --apply records an
 * ingest batch (dataset entities.cninfo), stores every topSearch response in reconcile-raw, writes
 * guarded updates and files set_identifier claims on unique-index clashes.
 * first-cohort.json is no longer a write target.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from '../../src/lib/entities/cninfo-org-id';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {resolveOrgId} from '../../src/lib/research/ingest/collectors/cninfo';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.cninfo;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};

/** resolveOrgId through a fetch that keeps the exact response bytes (evidence for reconcile-raw). */
async function lookup(code:string):Promise<CninfoLookup>{
 let bytes=new Uint8Array();
 const tap=(async(url:string|URL|Request,init?:RequestInit)=>{
  const res=await fetch(url,init);
  bytes=new Uint8Array(await res.arrayBuffer());
  return new Response(bytes,{status:res.status,statusText:res.statusText,headers:res.headers});
 }) as typeof fetch;
 const hit=await resolveOrgId(code,{fetch:tap});
 return {hit:hit?{orgId:hit.orgId,name:hit.name}:null,bytes};
}

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--apply')){console.error('usage: fill-cninfo-org-id.ts [--apply]');process.exit(2);}
 const apply=argv.includes('--apply');
 const admin=getAdminSupabase();
 const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const targets=await cninfoTargets(tables);
 if(!apply){
  const res=await fillCninfoOrgIds({tables,raw:memoryRawStore(),lookup,asOf},targets,{batchId:null});
  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',targets:targets.length,planned:res.planned,skipped:res.skippedSummary,errors:res.errors},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'fill-cninfo-org-id',dataset:DATASET,toolVersions:{source:'cninfo_topsearch',as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{({counts,errors}=await fillCninfoOrgIds({tables,raw:supabaseRawStore(admin),lookup,asOf},targets,{batchId}));}
 catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
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
