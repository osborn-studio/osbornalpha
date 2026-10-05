import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {digest,inputDigest,evaluateObservation,type EvaluationInput,type Observation,type InformationSet} from 'dsh-trade-strategy-evaluator/engine';
import {validateCommit,type EvaluationStore} from 'dsh-trade-strategy-evaluator/adapters';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';
import {fail} from '../ingest/pa-v1/json.js';
import {OBSERVATION_CONTRACT_V2} from '../market-policy';
import {assertWritableChain,transaction,serverTime,type S4Actor} from '../s4/db';
import {registeredObservationTransaction,withRegisteredObservationInTransaction} from './registered';
import {candidateFor,addRecord} from '../s4/records';

export type Commit=Parameters<EvaluationStore['commitEvaluationResult']>[0];
export function enabled(){if(process.env.ALPHA_S6_ENABLED!=='1')fail('not_configured');}
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function authorizeSession(db:PoolClient,actor:S4Actor,token:string|undefined,purpose:string){
 if(token===undefined)return; // Internal call: actor was already authenticated by the S4 browser/service boundary.
 const row=(await db.query('select * from research_s6_sessions where user_id=$1 and token_hash=$2',[actor.userId,tokenHash(token)])).rows[0];
 const now=new Date(await serverTime(db));
 if(!row||row.revoked||row.audience!=='alpha-evaluator'||row.created_at>now||row.expires_at<=now)fail('not_authenticated');
 if(!row.scopes.includes(purpose))fail('scope_denied');
}
export async function observationFor(db:PoolClient,actor:S4Actor,id:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))fail('invalid_schema');
 const row=(await db.query(`select r.*,s.revision,s.anchor_status as current_anchor,s.status as current_status
  from research_s4_records r join research_s4_observation_state s on s.user_id=r.user_id and s.observation_id=r.id
  where r.user_id=$1 and r.id=$2 and r.kind='Observation'`,[actor.userId,id])).rows[0];
 if(!row)fail('not_found');
 await assertWritableChain(db,actor);await candidateFor(db,actor,row.candidate_id);
 if(row.current_anchor==='integrity_failed')fail('anchor_integrity_failed');
 if(row.current_status==='cancelled')fail('policy_blocked');
 if(digest(row.payload)!==row.payload_hash||row.payload.candidate_ref!==row.candidate_id)fail('hash_mismatch');
 return row as typeof row & {payload:Observation};
}
async function informationFor(db:PoolClient,actor:S4Actor,o:Observation):Promise<InformationSet>{
 const row=(await db.query("select * from research_s4_records where user_id=$1 and id=$2 and candidate_id=$3 and kind='InputSnapshot'",[actor.userId,o.input_snapshot_ref,o.candidate_ref])).rows[0];
 if(!row||row.candidate_id!==o.candidate_ref||digest(row.payload)!==o.input_snapshot_hash||row.payload_hash!==o.input_snapshot_hash)fail('hash_mismatch');
 const p=row.payload;
 const candidate=(await db.query('select source_version_id from research_s4_candidates where user_id=$1 and id=$2',[actor.userId,o.candidate_ref])).rows[0];
 if(!candidate||candidate.source_version_id!==p.source_version_id)fail('hash_mismatch');
 const source=(await db.query('select * from research_source_versions where user_id=$1 and id=$2',[actor.userId,p.source_version_id])).rows[0];
 if(!source||digest(p.source_refs)!==digest([source.source_ref]))fail('hash_mismatch');
 const versions:InformationSet['versions']=[{ref:source.id,sha256:digest(source.source_version),available_at:source.received_at.toISOString()}];
 const refs:[string,string][]=[[p.card_ref,'ChangeCard'],[p.label_ref,'HumanLabel'],...p.exposure_refs.map((id:string):[string,string]=>[id,'ExposureEvent']),...(p.thesis_revision_ref?[[p.thesis_revision_ref,'ThesisRevision'] as [string,string]]:[])];
 const seen=new Set<string>();
 for(const [id,kind] of refs){
  const r=(await db.query('select * from research_s4_records where user_id=$1 and id=$2 and candidate_id=$3 and kind=$4',[actor.userId,id,o.candidate_ref,kind])).rows[0];
  if(!r||digest(r.payload)!==r.payload_hash||(id===p.card_ref&&r.payload_hash!==p.card_hash))fail('hash_mismatch');
  if(!seen.has(id))versions.push({ref:id,sha256:r.payload_hash,available_at:r.recorded_at.toISOString()});
  seen.add(id);
 }
 if(p.wiki_reference)versions.push({ref:'wiki:'+digest(p.wiki_reference),sha256:digest(p.wiki_reference),available_at:p.wiki_available_at});
 return {snapshot_ref:row.id,snapshot_sha256:row.payload_hash,input_cutoff_at:p.input_cutoff_at,versions};
}
export async function marketFor(db:PoolClient,actor:S4Actor,id:string,expectedObservationId?:string){
 if(typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(id))fail('invalid_schema');
 const r=(await db.query('select * from research_s6_markets where user_id=$1 and id=$2 and ($3::uuid is null or observation_id=$3)',[actor.userId,id,expectedObservationId??null])).rows[0];
 if(!r)fail(expectedObservationId===undefined?'not_found':'hash_mismatch');
 const o=await observationFor(db,actor,r.observation_id);
 // synthetic evidence ↔ synthetic observation; real evidence needs the real-market switch and, for handoff bundles, a 2.0 observation.
 const v2=(o.payload as {schema_version:string}).schema_version===OBSERVATION_CONTRACT_V2;
 if(r.evidence.kind==='synthetic'?!o.payload.synthetic:!['authorized-provider','attested-handoff'].includes(r.evidence.kind)||o.payload.synthetic||process.env.ALPHA_S6_REAL_MARKET!=='1'||(r.evidence.kind==='attested-handoff'&&!v2))fail('policy_blocked');
 if(digest(r.snapshot)!==r.snapshot_hash||tokenHash(r.raw_response)!==r.snapshot.raw_sha256||digest(r.evidence)!==r.evidence_hash)fail('hash_mismatch');
 return r;
}
export function assertEvaluationPolicy(observation:Observation){
 if(!observation.synthetic){
  if((observation as {schema_version:string}).schema_version!==OBSERVATION_CONTRACT_V2)fail('rule_unsupported');
  if(process.env.ALPHA_S6_REAL_MARKET!=='1')fail('policy_blocked');
 }
}
async function inputFor(db:PoolClient,actor:S4Actor,id:string,marketIds:string[],asOf:string,registered=false):Promise<EvaluationInput>{
 if(!Array.isArray(marketIds)||marketIds.length>2||new Set(marketIds).size!==marketIds.length)fail('invalid_schema');
 if(typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf)))fail('invalid_schema');
 if(Date.parse(asOf)>Date.parse(await serverTime(db)))fail('future_input');
 const row=await observationFor(db,actor,id),markets:EvaluationInput['market_snapshots']=[];
 assertEvaluationPolicy(row.payload);
 for(const mid of marketIds){const m=await marketFor(db,actor,mid,registered?id:undefined);if(m.observation_id!==id)fail('scope_denied');markets.push(m.snapshot);}
 const input:EvaluationInput={schema_version:'evaluator-input-output/1.0',observation:row.payload,observation_sha256:row.payload_hash,
  calendar:calendar as EvaluationInput['calendar'],market_snapshots:markets,market_snapshot_sha256s:markets.map(digest),
  information_set:await informationFor(db,actor,row.payload),as_of:asOf,input_sha256:''};
 input.input_sha256=inputDigest(input);return input;
}
export async function prepareInput(actor:S4Actor,id:string,marketIds:string[],asOf:string){enabled();return transaction(actor,db=>inputFor(db,actor,id,marketIds,asOf));}
/** Evaluator-internal preparation for an already authenticated actor. No display/export
 * exposure is appended; do not return this material directly from a browser route.
 * Machine session authorization remains separate. */
export async function prepareRegisteredInput(actor:S4Actor,id:string,marketIds:string[],asOf:string){enabled();return registeredObservationTransaction(actor,id,db=>inputFor(db,actor,id,marketIds,asOf,true));}
export async function currentMarketIds(db:PoolClient,actor:S4Actor,id:string,asOf:string|null):Promise<string[]>{
 return (await db.query(`select distinct on(snapshot->'security'->>'ticker') id from research_s6_markets
  where user_id=$1 and observation_id=$2 and ($3::timestamptz is null or fetched_at<=$3)
   and (snapshot->>'fetched_at')::timestamptz<=coalesce($3::timestamptz,clock_timestamp())
  order by snapshot->'security'->>'ticker',(snapshot->>'fetched_at')::timestamptz desc,fetched_at desc,id`,[actor.userId,id,asOf])).rows.map(r=>r.id).sort();
}
async function preparationFor(db:PoolClient,actor:S4Actor,id:string){
 const o=await observationFor(db,actor,id),asOf=await serverTime(db);
 return {asOf,revision:o.revision,marketIds:await currentMarketIds(db,actor,id,asOf)};
}
export async function prepareEvaluation(actor:S4Actor,id:string){
 enabled();return transaction(actor,db=>preparationFor(db,actor,id));
}
/** Internal metadata only; browser callers must use prepareRegisteredEvaluationDisplay. */
export async function prepareRegisteredEvaluation(actor:S4Actor,id:string){
 enabled();return registeredObservationTransaction(actor,id,db=>preparationFor(db,actor,id));
}
export function makeCommit(input:EvaluationInput,key:string,revision:number):Commit{
 const normalized={...input,input_sha256:inputDigest(input)},computed=evaluateObservation(normalized);
 if(!computed.ok)fail(computed.error.code);
 if(!computed.ok)throw new Error('unreachable');
 return {schema_version:'evaluator-rpc/1.0',observation_ref:{id:normalized.observation.id,sha256:normalized.observation_sha256},
  market_snapshot_refs:normalized.market_snapshots.map((m,i)=>({id:m.id,sha256:normalized.market_snapshot_sha256s[i]})),
  engine_version:computed.result.engine_version,rule_version:computed.result.rule_version,input_sha256:normalized.input_sha256,input:normalized,
  result:computed.result,result_sha256:computed.result_sha256,expected_revision:revision,idempotency_key:key,request_key:key};
}
export function createS6Store(actor:S4Actor,sessionToken?:string):EvaluationStore{return storeWithPolicy(actor,sessionToken,false);}
/** Candidate internal adapter; existing HTTP continues using the legacy store. */
export function createRegisteredS6Store(actor:S4Actor,sessionToken?:string):EvaluationStore{return storeWithPolicy(actor,sessionToken,true);}
function storeWithPolicy(actor:S4Actor,sessionToken:string|undefined,registered:boolean):EvaluationStore{
 async function run<T>(purpose:string,resolve:(db:PoolClient)=>Promise<string>,fn:(db:PoolClient,id:string)=>Promise<T>){enabled();return transaction(actor,async db=>{await authorizeSession(db,actor,sessionToken,purpose);
  // A session can expire while DB-only work runs under the owner lock.
  // Recheck before either a success result or business error leaves the transaction.
  await db.query('savepoint s6_session_work');
  let result:T;
  try{const id=await resolve(db);result=registered?await withRegisteredObservationInTransaction(db,actor,id,client=>fn(client,id)):await fn(db,id);}
  catch(error){await db.query('rollback to savepoint s6_session_work');await authorizeSession(db,actor,sessionToken,purpose);throw error;}
  await authorizeSession(db,actor,sessionToken,purpose);
  await db.query('release savepoint s6_session_work');return result;},sessionToken===undefined?undefined:db=>authorizeSession(db,actor,sessionToken,purpose));}
 return {
  readObservation:id=>run('observation:read',async()=>id,async db=>{const r=await observationFor(db,actor,id);return {schema_version:'evaluator-rpc/1.0',owner_scope:r.payload.owner_scope,revision:r.revision,sha256:r.payload_hash,observation:r.payload};}),
  readMarketSnapshot:id=>run('observation:read',async db=>{
   if(!registered)return '';
   if(typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(id))fail('invalid_schema');
   const row=(await db.query('select observation_id from research_s6_markets where user_id=$1 and id=$2',[actor.userId,id])).rows[0];
   if(!row)fail('not_found');return row.observation_id;
  },async(db,observationId)=>{const r=await marketFor(db,actor,id,registered?observationId:undefined);return {schema_version:'evaluator-rpc/1.0',owner_scope:{user_id:actor.userId,workspace_id:null},revision:0,sha256:r.snapshot_hash,snapshot:r.snapshot};}),
  commitEvaluationResult:async body=>{
   return run('evaluation:append',async()=>{validateCommit(body);return body.observation_ref.id;},async db=>{
    validateCommit(body); // Authenticate first; then recompute even a correctly hashed forgery.
    const row=await observationFor(db,actor,body.observation_ref.id);
    const authoritative=await inputFor(db,actor,row.id,body.market_snapshot_refs.map(r=>r.id),body.input.as_of,registered);
    if(digest(authoritative)!==digest(body.input))fail('hash_mismatch');
    const computed=evaluateObservation(authoritative);
    if(!computed.ok||computed.result_sha256!==body.result_sha256)fail('hash_mismatch');
    if(!computed.ok)throw new Error('unreachable');
    const hash=digest(body),old=(await db.query('select body_hash,receipt from research_s6_evaluations where user_id=$1 and idempotency_key=$2 and ($3::uuid is null or observation_id=$3)',[actor.userId,body.idempotency_key,registered?row.id:null])).rows[0];
    if(old){if(old.body_hash!==hash)fail('idempotency_conflict');return {...old.receipt,status:'duplicate'};}
    // New projections represent the current authority set, not a caller-selected backtest.
    // Exact retries stay valid after this five-minute preparation window expires.
    const now=Date.parse(await serverTime(db)),asOf=Date.parse(body.input.as_of);
    const last=(await db.query(`select input->>'as_of' as as_of from research_s6_evaluations where user_id=$1 and observation_id=$2 order by (receipt->>'revision')::int desc limit 1`,[actor.userId,row.id])).rows[0];
    if(asOf<now-300000||(last&&asOf<Date.parse(last.as_of)))fail('invalid_timeline');
    if(digest(await currentMarketIds(db,actor,row.id,body.input.as_of))!==digest(body.market_snapshot_refs.map(r=>r.id).sort()))fail('source_version_conflict');
    // Under the owner lock, current authority includes every committed receipt,
    // including PostgreSQL microseconds lost by JavaScript Date conversion.
    if(digest(await currentMarketIds(db,actor,row.id,null))!==digest(body.market_snapshot_refs.map(r=>r.id).sort()))fail('source_version_conflict');
    if(row.revision!==body.expected_revision)fail('revision_conflict');
    const id=randomUUID(),receipt={schema_version:'evaluator-rpc/1.0' as const,owner_scope:{user_id:actor.userId,workspace_id:null},status:'accepted' as const,
     observation_ref:row.id,revision:row.revision+1,idempotency_key:body.idempotency_key,input_sha256:body.input_sha256,result_sha256:body.result_sha256,evaluation_ref:id};
    await db.query(`insert into research_s6_evaluations(user_id,id,observation_id,idempotency_key,body_hash,input,result,result_hash,receipt) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[actor.userId,id,row.id,body.idempotency_key,hash,authoritative,computed.result,computed.result_sha256,receipt]);
    const changed=await db.query('update research_s4_observation_state set revision=revision+1,status=$4 where user_id=$1 and observation_id=$2 and revision=$3',[actor.userId,row.id,body.expected_revision,computed.result.status]);
    if(changed.rowCount!==1)fail('revision_conflict');
    await addRecord(db,actor,row.candidate_id,'ControlEvent',{type:'evaluation.append',evaluation_ref:id,input_sha256:body.input_sha256,result_sha256:body.result_sha256,observation_ref:row.id,expected_revision:body.expected_revision,revision:receipt.revision});
    return receipt;
   });
  },
 };
}
