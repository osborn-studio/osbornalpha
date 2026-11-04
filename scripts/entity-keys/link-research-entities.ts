/**
 * Link ONE user's research entities (research_entity_keys / research_entity_securities) to the
 * global issuer master. Only entities with a valid hard identifier (lei/usci/cik) and a name are
 * promoted; per-user private research data is never promoted globally without an explicit user
 * scope, and the public rows carry no user or entity ids (those stay in the service-only receipt).
 *
 *   npx tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>] [--apply]
 *
 * The user defaults to RESEARCH_OWNER_USER_ID; the script refuses to run without a valid UUID.
 * Without --apply this is a dry run: it prints plan counts and the skipped list and writes nothing.
 * With --apply it upserts issuers, attaches securities, back-fills research_entity_keys.issuer_id and
 * research_entity_securities.ticker, records an ingest_batches receipt (dataset
 * entities.research-link) and a freshness attempt.
 * Exit 1 when the batch failed (an empty plan included) or any row failed; 2 on bad arguments.
 *
 * tsx does NOT load .env.local. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by
 * exporting them, or run: node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts …
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import type {TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
import type {BatchError,BatchStatus} from '../../src/lib/dq/batches';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {RESEARCH_LINK_DATASET,applyResearchLink,planResearchLink} from '../../src/lib/entities/link-research';
import type {EntityKeyRow,EntitySecurityRow} from '../../src/lib/entities/link-research';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=RESEARCH_LINK_DATASET;
const USAGE='usage: link-research-entities.ts [--user <uuid>] [--apply]   (user defaults to RESEARCH_OWNER_USER_ID)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv:string[]):{userId:string;apply:boolean}{
 let userId=process.env.RESEARCH_OWNER_USER_ID,apply=false;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--apply')apply=true;
  else if(a==='--user')userId=argv[++i];
  else{console.error(USAGE);process.exit(2);}
 }
 if(!userId||!UUID.test(userId.trim())){console.error(USAGE);process.exit(2);}
 return {userId:userId.trim().toLowerCase(),apply};
}

async function loadPlan(client:TableClient,user_id:string){
 const keys=await selectAll(client,'research_entity_keys',{user_id},'entity_id') as unknown as EntityKeyRow[];
 const securities=await selectAll(client,'research_entity_securities',{user_id},'id') as unknown as EntitySecurityRow[];
 const universe=new Map((await selectAll(client,'stocks_universe',{},'ticker')).map(r=>[String(r.ticker),String(r.market)] as const));
 const asOf=new Date().toISOString().slice(0,10);
 return {keys,securities,universeSize:universe.size,plan:planResearchLink(keys,securities,universe,asOf)};
}

async function dryRun(client:TableClient,userId:string){
 const {keys,securities,universeSize,plan}=await loadPlan(client,userId);
 console.log(JSON.stringify({
  mode:'dry-run (no ingest batch written; pass --apply to write)',user:userId,
  keys:keys.length,securityRows:securities.length,universe:universeSize,
  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped,
 },null,1));
}

async function apply(client:TableClient,user_id:string):Promise<0|1>{
 // The batch starts before any read so a failed read still leaves a failed receipt. The user id
 // and the research origin live only here (service-only receipt), never in the public issuer rows,
 // whose provenance says 'curated'.
 const {batchId}=await startBatch(client,{producer:'research-entity-link',dataset:DATASET,toolVersions:{user_id,origin:'research_entity_keys'}});
 let counts=emptyCounts();
 let errors:BatchError[]=[];
 let skipped:Record<string,number>={};
 let status:BatchStatus='failed';
 try{
  const {plan}=await loadPlan(client,user_id);
  const result=await applyResearchLink(client,plan,{userId:user_id,batchId});
  ({counts,errors}=result);
  skipped=result.skippedSummary;
 }catch(e){
  errors=[...errors,{code:'exception',message:errorMessage(e)}];
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
 console.log(JSON.stringify({batchId,user:user_id,status,counts,skipped,errors:errors.slice(0,20)},null,1));
 return outcome.exitCode;
}

async function main(){
 const {userId,apply:doApply}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,userId);return;}
 process.exitCode=await apply(client,userId);
}

main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
