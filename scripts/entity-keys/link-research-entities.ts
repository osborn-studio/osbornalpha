/**
 * Link ONE user's research entities (research_entity_keys / research_entity_securities) to the
 * global issuer master. Only entities with a hard identifier (lei/usci/cik) are promoted; per-user
 * private research data is never promoted globally without an explicit user scope.
 *
 *   npx tsx scripts/entity-keys/link-research-entities.ts [--user <uuid>] [--apply]
 *
 * The user defaults to RESEARCH_OWNER_USER_ID; the script refuses to run without a valid UUID.
 * Without --apply this is a dry run: it prints plan counts and the skipped list and writes nothing.
 * With --apply it upserts issuers, attaches securities, back-fills research_entity_keys.issuer_id and
 * research_entity_securities.ticker, records an ingest_batches receipt (dataset
 * entities.research-link) and a freshness attempt.
 *
 * tsx does NOT load .env.local. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by
 * exporting them, or run: node --env-file=.env.local --import tsx scripts/entity-keys/link-research-entities.ts …
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import type {TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
import type {BatchCounts,BatchError,BatchStatus} from '../../src/lib/dq/batches';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {attachSecurity,upsertIssuerByIdentifiers} from '../../src/lib/entities/issuers';
import {planResearchLink} from '../../src/lib/entities/link-research';
import type {EntityKeyRow,EntitySecurityRow} from '../../src/lib/entities/link-research';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET='entities.research-link';
const USAGE='usage: link-research-entities.ts [--user <uuid>] [--apply]   (user defaults to RESEARCH_OWNER_USER_ID)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ERRORS=200;

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

const message=(e:unknown)=>e instanceof Error?e.message:String(e);

async function loadPlan(client:TableClient,user_id:string){
 const keys=await selectAll(client,'research_entity_keys',{user_id},'entity_id') as unknown as EntityKeyRow[];
 const securities=await selectAll(client,'research_entity_securities',{user_id},'id') as unknown as EntitySecurityRow[];
 const universe=new Set((await selectAll(client,'stocks_universe',{},'ticker')).map(r=>String(r.ticker)));
 return {keys,securities,universeSize:universe.size,plan:planResearchLink(keys,securities,universe)};
}

async function dryRun(client:TableClient,userId:string){
 const {keys,securities,universeSize,plan}=await loadPlan(client,userId);
 console.log(JSON.stringify({
  mode:'dry-run (no ingest batch written; pass --apply to write)',user:userId,
  keys:keys.length,securityRows:securities.length,universe:universeSize,
  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped,
 },null,1));
}

async function apply(client:TableClient,user_id:string):Promise<{status:BatchStatus;counts:BatchCounts}>{
 // The batch starts before any read so a failed read still leaves a failed receipt.
 const {batchId}=await startBatch(client,{producer:'research-entity-link',dataset:DATASET,toolVersions:{user_id}});
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 const pushError=(e:BatchError)=>{if(errors.length<MAX_ERRORS)errors.push(e);};
 let status:BatchStatus='failed';
 try{
  const {keys,plan}=await loadPlan(client,user_id);
  counts.fetched=keys.length;

  const issuerByEntity=new Map<string,string>();
  for(const {entity_key,input} of plan.issuers){
   const entity_id=entity_key.slice(user_id.length+1);
   try{
    const res=await upsertIssuerByIdentifiers(client,input);
    if(res.conflict||!res.issuer_id){counts.quarantined++;pushError({code:'issuer_conflict',key:entity_key,message:res.reason});continue;}
    const n=await client.update('research_entity_keys',{user_id,entity_id},{issuer_id:res.issuer_id});
    if(n!==1){counts.failed++;pushError({code:'link_update_count',key:entity_key,message:`expected 1 row, updated ${n}`});continue;}
    issuerByEntity.set(entity_key,res.issuer_id);
    if(res.created)counts.inserted++;else counts.duplicates++;
   }catch(e){counts.failed++;pushError({code:'issuer_error',key:entity_key,message:message(e)});}
  }

  for(const sec of plan.securities){
   const issuer_id=issuerByEntity.get(sec.entity_key);
   if(!issuer_id)continue; // its issuer was quarantined or failed; already counted there
   const {entity_key,security_id,...rest}=sec;
   const key=`${entity_key}:${security_id}`;
   try{
    const res=await attachSecurity(client,{...rest,issuer_id,provenance:{research_security_id:security_id,user_id}});
    if(res==='conflict'){counts.quarantined++;pushError({code:'ownership_conflict',key,message:sec.ticker});continue;}
    const n=await client.update('research_entity_securities',{user_id,id:security_id},{ticker:sec.ticker});
    if(n!==1){counts.failed++;pushError({code:'link_update_count',key,message:`expected 1 row, updated ${n}`});continue;}
    if(res==='inserted')counts.inserted++;else counts.duplicates++;
   }catch(e){
    counts.failed++;
    const msg=message(e);
    pushError({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key,message:msg});
   }
  }
 }catch(e){
  pushError({code:'exception',message:message(e)});
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${message(e)}`);status='failed';}
  await recordAttempt(client,DATASET,{ok:status!=='failed',cadence:'event'});
 }
 console.log(JSON.stringify({batchId,user:user_id,status,counts,errors:errors.slice(0,20)},null,1));
 return {status,counts};
}

async function main(){
 const {userId,apply:doApply}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,userId);return;}
 const {status,counts}=await apply(client,userId);
 if(status==='failed'||counts.failed>0)process.exit(1);
}

main().catch(e=>{console.error(message(e));process.exit(1);});
